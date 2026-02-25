import * as fs from "fs";
import * as path from "path";
import { ROOT_DIR, KNOWLEDGE_DIR } from "../utils/paths";
import { searchTwitter } from "./sources/twitter";
import { searchReddit } from "./sources/reddit";
import { searchLinkedIn } from "./sources/linkedin";
import { searchTikTok } from "./sources/tiktok";
import { fetchRssFeeds, discoverFeeds, addDiscoveredFeeds } from "./sources/rss";
import { extractSignal, ExtractionInput } from "./extractor";
import { writeSignal } from "./writer";

interface VentureConfig {
  name: string;
  file: string;
  topics: string[];
  competitors?: string[];
  key_people?: string[];
}

interface SourcesConfig {
  twitter?: { enabled: boolean; min_engagement: number };
  reddit?: { enabled: boolean; min_upvotes: number };
  linkedin?: { enabled: boolean; min_engagement: number };
  tiktok?: { enabled: boolean; min_views: number };
  rss?: { enabled: boolean; feeds: string[]; auto_discover?: boolean; auto_discovered_feeds?: string[] };
}

interface KnowledgeConfig {
  ventures: VentureConfig[];
  confidence_threshold: number;
  sources: SourcesConfig;
}

export interface CrawlResult {
  sourcesCrawled: string[];
  signalsFound: number;
  signalsWritten: number;
  signalsSkipped: number;
  errors: string[];
}

function loadConfig(): KnowledgeConfig {
  const configPath = path.join(ROOT_DIR, "knowledge.config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("knowledge.config.json not found");
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

/**
 * Main crawl orchestrator. Runs all 5 enabled sources for each venture.
 * One failed source does not stop others.
 */
export async function runCrawl(): Promise<CrawlResult> {
  const config = loadConfig();
  const result: CrawlResult = {
    sourcesCrawled: [],
    signalsFound: 0,
    signalsWritten: 0,
    signalsSkipped: 0,
    errors: [],
  };

  if (!config.ventures || config.ventures.length === 0) {
    console.log("[crawler] No ventures configured. Skipping crawl.");
    return result;
  }

  for (const venture of config.ventures) {
    const searchQuery = [
      venture.name,
      ...(venture.topics || []),
      ...(venture.competitors || []),
    ].join(" OR ");

    // ── Twitter ─────────────────────────────────────────────────────
    if (config.sources.twitter?.enabled) {
      try {
        console.log(`[crawler] Searching Twitter for: ${venture.name}`);
        const tweets = await searchTwitter(searchQuery, {
          bearerToken: process.env.TWITTER_BEARER_TOKEN || "",
          minEngagement: config.sources.twitter.min_engagement || 50,
        });
        if (!result.sourcesCrawled.includes("twitter")) result.sourcesCrawled.push("twitter");

        for (const tweet of tweets) {
          await processContent(
            {
              venture_name: venture.name,
              venture_topics: venture.topics || [],
              content: tweet.text,
              source_url: tweet.source_url,
              source_date: tweet.created_at,
            },
            config.confidence_threshold,
            result
          );
        }
      } catch (err: any) {
        result.errors.push(`twitter: ${err.message}`);
        console.error(`[crawler] Twitter error: ${err.message}`);
      }
    }

    // ── Reddit ──────────────────────────────────────────────────────
    if (config.sources.reddit?.enabled) {
      try {
        console.log(`[crawler] Searching Reddit for: ${venture.name}`);
        const posts = await searchReddit(searchQuery, {
          minUpvotes: config.sources.reddit.min_upvotes || 50,
        });
        if (!result.sourcesCrawled.includes("reddit")) result.sourcesCrawled.push("reddit");

        for (const post of posts) {
          const content = `${post.title}\n${post.selftext}`.slice(0, 2000);
          await processContent(
            {
              venture_name: venture.name,
              venture_topics: venture.topics || [],
              content,
              source_url: post.permalink,
              source_date: new Date(post.created_utc * 1000).toISOString(),
            },
            config.confidence_threshold,
            result
          );
        }
      } catch (err: any) {
        result.errors.push(`reddit: ${err.message}`);
        console.error(`[crawler] Reddit error: ${err.message}`);
      }
    }

    // ── LinkedIn ────────────────────────────────────────────────────
    if (config.sources.linkedin?.enabled) {
      try {
        console.log(`[crawler] Searching LinkedIn for: ${venture.name}`);
        const posts = await searchLinkedIn(searchQuery, {
          apifyToken: process.env.APIFY_API_TOKEN || "",
          minEngagement: config.sources.linkedin?.min_engagement || 20,
        });
        if (!result.sourcesCrawled.includes("linkedin")) result.sourcesCrawled.push("linkedin");

        for (const post of posts) {
          await processContent(
            {
              venture_name: venture.name,
              venture_topics: venture.topics || [],
              content: post.text,
              source_url: post.url,
              source_date: post.published_at,
            },
            config.confidence_threshold,
            result
          );
        }
      } catch (err: any) {
        result.errors.push(`linkedin: ${err.message}`);
        console.error(`[crawler] LinkedIn error: ${err.message}`);
      }
    }

    // ── TikTok ──────────────────────────────────────────────────────
    if (config.sources.tiktok?.enabled) {
      try {
        console.log(`[crawler] Searching TikTok for: ${venture.name}`);
        const videos = await searchTikTok(searchQuery, {
          apifyToken: process.env.APIFY_API_TOKEN || "",
          minViews: config.sources.tiktok?.min_views || 500,
        });
        if (!result.sourcesCrawled.includes("tiktok")) result.sourcesCrawled.push("tiktok");

        for (const video of videos) {
          await processContent(
            {
              venture_name: venture.name,
              venture_topics: venture.topics || [],
              content: video.description,
              source_url: video.url,
              source_date: video.published_at,
            },
            config.confidence_threshold,
            result
          );
        }
      } catch (err: any) {
        result.errors.push(`tiktok: ${err.message}`);
        console.error(`[crawler] TikTok error: ${err.message}`);
      }
    }

    // ── RSS ──────────────────────────────────────────────────────────
    if (config.sources.rss?.enabled) {
      try {
        const feeds = [
          ...(config.sources.rss.feeds || []),
          ...(config.sources.rss.auto_discovered_feeds || []),
        ];

        if (feeds.length > 0) {
          console.log(`[crawler] Fetching ${feeds.length} RSS feeds for: ${venture.name}`);
          const items = await fetchRssFeeds(feeds, venture.topics);
          if (!result.sourcesCrawled.includes("rss")) result.sourcesCrawled.push("rss");

          for (const item of items) {
            await processContent(
              {
                venture_name: venture.name,
                venture_topics: venture.topics || [],
                content: item.content,
                source_url: item.url,
                source_date: item.published_at,
              },
              config.confidence_threshold,
              result
            );
          }
        }

        // Auto-discover feeds for competitors
        if (config.sources.rss.auto_discover && venture.competitors) {
          const competitorDomains = venture.competitors
            .map((c) => c.toLowerCase().replace(/\s+/g, ""))
            .filter(Boolean);
          if (competitorDomains.length > 0) {
            const discovered = await discoverFeeds(competitorDomains);
            if (discovered.length > 0) {
              addDiscoveredFeeds(discovered);
              console.log(
                `[crawler] Discovered ${discovered.length} new RSS feeds`
              );
            }
          }
        }
      } catch (err: any) {
        result.errors.push(`rss: ${err.message}`);
        console.error(`[crawler] RSS error: ${err.message}`);
      }
    }
  }

  // Trim intelligence feeds after crawl
  try {
    const ventureDir = path.join(KNOWLEDGE_DIR, "venture");
    if (fs.existsSync(ventureDir)) {
      const files = fs.readdirSync(ventureDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        trimIntelligenceFeed(path.join(ventureDir, file));
      }
    }
  } catch (err: any) {
    console.error(`[crawler] Trim error: ${err.message}`);
  }

  return result;
}

async function processContent(
  input: ExtractionInput,
  confidenceThreshold: number,
  result: CrawlResult
): Promise<void> {
  try {
    const signal = await extractSignal(input);
    if (!signal) return;

    result.signalsFound++;

    const writeResult = writeSignal(signal, confidenceThreshold);
    if (writeResult.written) {
      result.signalsWritten++;
    } else {
      result.signalsSkipped++;
    }
  } catch (err: any) {
    result.errors.push(`extraction: ${err.message}`);
  }
}

/**
 * Trim the ## Intelligence feed section to maxEntries.
 * This is the ONE place overwriting is allowed — trimming old intelligence.
 */
function trimIntelligenceFeed(
  filepath: string,
  maxEntries: number = 50
): void {
  if (!fs.existsSync(filepath)) return;

  const content = fs.readFileSync(filepath, "utf-8");
  const sectionMarker = "## Intelligence feed";
  const sectionIndex = content.indexOf(sectionMarker);
  if (sectionIndex === -1) return;

  const beforeSection = content.slice(0, sectionIndex);
  const sectionContent = content.slice(sectionIndex + sectionMarker.length);

  // Count entries (each starts with **[)
  const entryPattern = /\n\*\*\[/g;
  const entries: number[] = [];
  let match;
  while ((match = entryPattern.exec(sectionContent)) !== null) {
    entries.push(match.index);
  }

  if (entries.length <= maxEntries) return;

  // Keep only the most recent entries (they're at the top after the header)
  const keepFrom = entries[entries.length - maxEntries];
  const trimmedSection = sectionContent.slice(keepFrom);

  const newContent = beforeSection + sectionMarker + trimmedSection;
  fs.writeFileSync(filepath, newContent, "utf-8");

  console.log(
    `[crawler] Trimmed ${filepath}: ${entries.length} → ${maxEntries} entries`
  );
}
