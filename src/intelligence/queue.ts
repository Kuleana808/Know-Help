/**
 * Managed crawler queue for multi-user hosted tier.
 * Uses BullMQ with Redis (Upstash or self-hosted) for reliable job processing.
 *
 * Queue architecture:
 * - "crawl" queue: per-user crawl jobs with deduplication
 * - "crawl-schedule" repeatable job: triggers crawls on schedule
 * - Concurrency: 3 parallel crawl workers
 * - Retry: 2 attempts with exponential backoff
 */
import { Queue, Worker, Job } from "bullmq";
import { db } from "../db/database";
import { v4 as uuidv4 } from "uuid";
import { s3Ops } from "../hosted/s3";

// ── Redis connection ────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function parseRedisUrl(url: string): { host: string; port: number; password?: string; tls?: object } {
  const parsed = new URL(url);
  const config: any = {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
  };
  if (parsed.password) config.password = parsed.password;
  if (parsed.protocol === "rediss:") config.tls = {};
  return config;
}

const redisConnection = parseRedisUrl(REDIS_URL);

// ── Queue setup ─────────────────────────────────────────────────────────────

export interface CrawlJobData {
  userId: string;
  s3Prefix: string;
  sources: string[];
  triggeredBy: "schedule" | "manual" | "webhook";
}

export interface CrawlJobResult {
  sourcesCrawled: string[];
  signalsFound: number;
  signalsWritten: number;
  signalsSkipped: number;
  errors: string[];
  durationMs: number;
}

let crawlQueue: Queue<CrawlJobData, CrawlJobResult> | null = null;
let crawlWorker: Worker<CrawlJobData, CrawlJobResult> | null = null;

/**
 * Initialize the crawl queue and worker.
 * Call this once at server startup.
 */
export function initCrawlQueue(): { queue: Queue; worker: Worker } {
  crawlQueue = new Queue<CrawlJobData, CrawlJobResult>("crawl", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  crawlWorker = new Worker<CrawlJobData, CrawlJobResult>(
    "crawl",
    processCrawlJob,
    {
      connection: redisConnection,
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    }
  );

  // Event logging
  crawlWorker.on("completed", (job: Job<CrawlJobData, CrawlJobResult>) => {
    console.log(
      `[queue] Crawl completed for user ${job.data.userId}: ` +
        `${job.returnvalue?.signalsWritten || 0} signals written in ${job.returnvalue?.durationMs || 0}ms`
    );
  });

  crawlWorker.on("failed", (job: Job<CrawlJobData, CrawlJobResult> | undefined, err: Error) => {
    console.error(
      `[queue] Crawl failed for user ${job?.data?.userId || "unknown"}: ${err.message}`
    );
  });

  crawlWorker.on("error", (err: Error) => {
    console.error(`[queue] Worker error: ${err.message}`);
  });

  console.log("[queue] Crawl queue and worker initialized");
  return { queue: crawlQueue, worker: crawlWorker };
}

// ── Job processing ──────────────────────────────────────────────────────────

/**
 * Process a single crawl job for a user.
 * Reads their config from S3, runs enabled sources, writes signals back.
 */
async function processCrawlJob(
  job: Job<CrawlJobData, CrawlJobResult>
): Promise<CrawlJobResult> {
  const { userId, s3Prefix, sources, triggeredBy } = job.data;
  const startTime = Date.now();

  // Update job status in database
  const jobId = uuidv4();
  db.prepare(
    `INSERT INTO crawl_jobs (id, user_id, status, sources, started_at)
     VALUES (?, ?, 'running', ?, ?)`
  ).run(jobId, userId, JSON.stringify(sources), new Date().toISOString());

  await job.updateProgress(10);

  try {
    // Read user's config
    let configStr: string;
    try {
      configStr = await s3Ops.read(s3Prefix, "../knowledge.config.json");
    } catch {
      // Try at prefix root
      try {
        configStr = await s3Ops.read(s3Prefix, "knowledge.config.json");
      } catch {
        throw new Error("No knowledge.config.json found for user");
      }
    }

    const config = JSON.parse(configStr);
    if (!config.ventures || config.ventures.length === 0) {
      return {
        sourcesCrawled: [],
        signalsFound: 0,
        signalsWritten: 0,
        signalsSkipped: 0,
        errors: ["No ventures configured"],
        durationMs: Date.now() - startTime,
      };
    }

    await job.updateProgress(20);

    // Import crawlers lazily to avoid loading them if not needed
    const result: CrawlJobResult = {
      sourcesCrawled: [],
      signalsFound: 0,
      signalsWritten: 0,
      signalsSkipped: 0,
      errors: [],
      durationMs: 0,
    };

    for (const venture of config.ventures) {
      const searchQuery = [
        venture.name,
        ...(venture.topics || []),
        ...(venture.competitors || []),
      ].join(" OR ");

      // Twitter
      if (sources.includes("twitter") && config.sources?.twitter?.enabled) {
        try {
          const { searchTwitter } = await import("./sources/twitter");
          const tweets = await searchTwitter(searchQuery, {
            bearerToken: process.env.TWITTER_BEARER_TOKEN || "",
            minEngagement: config.sources.twitter.min_engagement || 50,
          });
          result.sourcesCrawled.push("twitter");

          for (const tweet of tweets) {
            await processSignalForUser(
              s3Prefix,
              venture,
              tweet.text,
              tweet.source_url,
              tweet.created_at,
              config.confidence_threshold || 0.7,
              result
            );
          }
        } catch (err: any) {
          result.errors.push(`twitter: ${err.message}`);
        }
      }

      // Reddit
      if (sources.includes("reddit") && config.sources?.reddit?.enabled) {
        try {
          const { searchReddit } = await import("./sources/reddit");
          const posts = await searchReddit(searchQuery, {
            minUpvotes: config.sources.reddit.min_upvotes || 50,
          });
          result.sourcesCrawled.push("reddit");

          for (const post of posts) {
            const content = `${post.title}\n${post.selftext}`.slice(0, 2000);
            await processSignalForUser(
              s3Prefix,
              venture,
              content,
              post.permalink,
              new Date(post.created_utc * 1000).toISOString(),
              config.confidence_threshold || 0.7,
              result
            );
          }
        } catch (err: any) {
          result.errors.push(`reddit: ${err.message}`);
        }
      }

      // LinkedIn
      if (sources.includes("linkedin") && config.sources?.linkedin?.enabled) {
        try {
          const { searchLinkedIn } = await import("./sources/linkedin");
          const posts = await searchLinkedIn(searchQuery, {
            apifyToken: process.env.APIFY_API_TOKEN || "",
            minEngagement: config.sources.linkedin?.min_engagement || 20,
          });
          result.sourcesCrawled.push("linkedin");

          for (const post of posts) {
            await processSignalForUser(
              s3Prefix,
              venture,
              post.text,
              post.url,
              post.published_at,
              config.confidence_threshold || 0.7,
              result
            );
          }
        } catch (err: any) {
          result.errors.push(`linkedin: ${err.message}`);
        }
      }

      // TikTok
      if (sources.includes("tiktok") && config.sources?.tiktok?.enabled) {
        try {
          const { searchTikTok } = await import("./sources/tiktok");
          const videos = await searchTikTok(searchQuery, {
            apifyToken: process.env.APIFY_API_TOKEN || "",
            minViews: config.sources.tiktok?.min_views || 500,
          });
          result.sourcesCrawled.push("tiktok");

          for (const video of videos) {
            await processSignalForUser(
              s3Prefix,
              venture,
              video.description,
              video.url,
              video.published_at,
              config.confidence_threshold || 0.7,
              result
            );
          }
        } catch (err: any) {
          result.errors.push(`tiktok: ${err.message}`);
        }
      }

      // RSS
      if (sources.includes("rss") && config.sources?.rss?.enabled) {
        try {
          const { fetchRssFeeds } = await import("./sources/rss");
          const feeds = [
            ...(config.sources.rss.feeds || []),
            ...(config.sources.rss.auto_discovered_feeds || []),
          ];

          if (feeds.length > 0) {
            const items = await fetchRssFeeds(feeds, venture.topics || []);
            result.sourcesCrawled.push("rss");

            for (const item of items) {
              await processSignalForUser(
                s3Prefix,
                venture,
                item.content,
                item.url,
                item.published_at,
                config.confidence_threshold || 0.7,
                result
              );
            }
          }
        } catch (err: any) {
          result.errors.push(`rss: ${err.message}`);
        }
      }

      await job.updateProgress(
        20 + Math.floor((80 * (config.ventures.indexOf(venture) + 1)) / config.ventures.length)
      );
    }

    result.durationMs = Date.now() - startTime;

    // Update database
    db.prepare(
      `UPDATE crawl_jobs SET status = 'completed', signals_written = ?, completed_at = ? WHERE id = ?`
    ).run(result.signalsWritten, new Date().toISOString(), jobId);

    return result;
  } catch (err: any) {
    db.prepare(
      `UPDATE crawl_jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`
    ).run(err.message, new Date().toISOString(), jobId);
    throw err;
  }
}

/**
 * Process a signal for a hosted user (writes to S3 instead of local filesystem).
 */
async function processSignalForUser(
  s3Prefix: string,
  venture: any,
  content: string,
  sourceUrl: string,
  sourceDate: string,
  confidenceThreshold: number,
  result: CrawlJobResult
): Promise<void> {
  try {
    const { extractSignal } = await import("./extractor");
    const signal = await extractSignal({
      venture_name: venture.name,
      venture_topics: venture.topics || [],
      content,
      source_url: sourceUrl,
      source_date: sourceDate,
    });
    if (!signal) return;

    result.signalsFound++;

    if (signal.confidence >= confidenceThreshold) {
      // Write signal to user's knowledge base via S3
      const slug = venture.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const ventureFile = `venture/${slug}.md`;

      const dateStr = new Date(sourceDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const signalEntry = `\n**[${dateStr}]** ${signal.summary} ([source](${sourceUrl})) — confidence: ${signal.confidence}\n`;

      try {
        const existing = await s3Ops.read(s3Prefix, ventureFile);
        if (!existing.includes("## Intelligence feed")) {
          await s3Ops.append(
            s3Prefix,
            ventureFile,
            `\n## Intelligence feed\n${signalEntry}`
          );
        } else {
          await s3Ops.append(s3Prefix, ventureFile, signalEntry);
        }
      } catch {
        // File doesn't exist yet — create with signal
        await s3Ops.write(
          s3Prefix,
          ventureFile,
          `---\nLoad for: ${slug}, venture\n---\n\n# ${venture.name}\n\n## Intelligence feed\n${signalEntry}`
        );
      }

      result.signalsWritten++;
    } else {
      result.signalsSkipped++;
    }
  } catch (err: any) {
    result.errors.push(`signal-processing: ${err.message}`);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Enqueue a crawl job for a specific user.
 */
export async function enqueueCrawl(
  userId: string,
  s3Prefix: string,
  triggeredBy: "schedule" | "manual" | "webhook" = "manual"
): Promise<string> {
  if (!crawlQueue) {
    throw new Error("Crawl queue not initialized. Call initCrawlQueue() first.");
  }

  // Deduplicate: don't queue if user already has a waiting/active job
  const waiting = await crawlQueue.getJobs(["waiting", "active"]);
  const hasExisting = waiting.some((j) => j.data.userId === userId);
  if (hasExisting) {
    return "already-queued";
  }

  const job = await crawlQueue.add(
    `crawl-${userId}`,
    {
      userId,
      s3Prefix,
      sources: ["twitter", "reddit", "linkedin", "tiktok", "rss"],
      triggeredBy,
    },
    {
      jobId: `crawl-${userId}-${Date.now()}`,
    }
  );

  return job.id || "queued";
}

/**
 * Schedule recurring crawls for all active users.
 * Called by the scheduler to bulk-enqueue crawls.
 */
export async function scheduleAllUserCrawls(): Promise<number> {
  const activeUsers = db
    .prepare(
      `SELECT id, s3_prefix FROM users
       WHERE subscription_status IN ('active', 'trialing')
       AND s3_prefix IS NOT NULL`
    )
    .all() as { id: string; s3_prefix: string }[];

  let queued = 0;
  for (const user of activeUsers) {
    try {
      const result = await enqueueCrawl(user.id, user.s3_prefix, "schedule");
      if (result !== "already-queued") queued++;
    } catch (err: any) {
      console.error(`[queue] Failed to queue crawl for ${user.id}: ${err.message}`);
    }
  }

  console.log(`[queue] Scheduled crawls for ${queued}/${activeUsers.length} active users`);
  return queued;
}

/**
 * Get queue stats for monitoring.
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  if (!crawlQueue) {
    return { waiting: 0, active: 0, completed: 0, failed: 0 };
  }

  const [waiting, active, completed, failed] = await Promise.all([
    crawlQueue.getWaitingCount(),
    crawlQueue.getActiveCount(),
    crawlQueue.getCompletedCount(),
    crawlQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

/**
 * Get job status for a specific user's latest crawl.
 */
export async function getUserJobStatus(
  userId: string
): Promise<{ status: string; progress?: number; result?: CrawlJobResult } | null> {
  if (!crawlQueue) return null;

  const jobs = await crawlQueue.getJobs(["waiting", "active", "completed", "failed"]);
  const userJobs = jobs
    .filter((j) => j.data.userId === userId)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (userJobs.length === 0) return null;

  const latest = userJobs[0];
  const state = await latest.getState();

  return {
    status: state,
    progress: latest.progress as number | undefined,
    result: latest.returnvalue || undefined,
  };
}

/**
 * Gracefully shut down the queue and worker.
 */
export async function shutdownQueue(): Promise<void> {
  if (crawlWorker) {
    await crawlWorker.close();
    console.log("[queue] Worker shut down");
  }
  if (crawlQueue) {
    await crawlQueue.close();
    console.log("[queue] Queue shut down");
  }
}
