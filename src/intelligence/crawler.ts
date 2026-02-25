import * as fs from "fs";
import * as path from "path";
import { ROOT_DIR } from "../utils/paths";
import { searchTwitter, Tweet } from "./sources/twitter";
import { searchReddit, RedditPost } from "./sources/reddit";
import { extractSignal, ExtractionInput } from "./extractor";
import { writeSignal } from "./writer";

interface VentureConfig {
  name: string;
  file: string;
  topics: string[];
  competitors?: string[];
  key_people?: string[];
}

interface KnowledgeConfig {
  ventures: VentureConfig[];
  confidence_threshold: number;
  sources: {
    twitter: { enabled: boolean; min_engagement: number };
    reddit: { enabled: boolean; min_upvotes: number };
  };
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
 * Main crawl orchestrator. Runs all enabled sources for each venture.
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

    // Twitter
    if (config.sources.twitter?.enabled) {
      try {
        console.log(
          `[crawler] Searching Twitter for: ${venture.name}`
        );
        const tweets = await searchTwitter(searchQuery, {
          bearerToken: process.env.TWITTER_BEARER_TOKEN || "",
          minEngagement: config.sources.twitter.min_engagement || 50,
        });
        result.sourcesCrawled.push("twitter");

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

    // Reddit
    if (config.sources.reddit?.enabled) {
      try {
        console.log(
          `[crawler] Searching Reddit for: ${venture.name}`
        );
        const posts = await searchReddit(searchQuery, {
          minUpvotes: config.sources.reddit.min_upvotes || 50,
        });
        result.sourcesCrawled.push("reddit");

        for (const post of posts) {
          const content = `${post.title}\n${post.selftext}`.slice(
            0,
            2000
          );
          await processContent(
            {
              venture_name: venture.name,
              venture_topics: venture.topics || [],
              content,
              source_url: post.permalink,
              source_date: new Date(
                post.created_utc * 1000
              ).toISOString(),
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
