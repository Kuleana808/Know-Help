import Parser from "rss-parser";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { ROOT_DIR } from "../../utils/paths";
import { appendJsonl } from "../../utils/jsonl";

const parser = new Parser();

export interface RssItem {
  title: string;
  content: string;
  url: string;
  author: string;
  published_at: string;
  feed_url: string;
}

export interface RssConfig {
  feeds: string[];
  autoDiscover: boolean;
}

/**
 * Fetch and parse all configured RSS feeds.
 * Returns items published in the last 6 hours.
 */
export async function fetchRssFeeds(
  feeds: string[],
  ventureTopics?: string[]
): Promise<RssItem[]> {
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  const allItems: RssItem[] = [];

  for (const feedUrl of feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);

      for (const item of feed.items || []) {
        const pubDate = item.pubDate
          ? new Date(item.pubDate).getTime()
          : Date.now();

        if (pubDate >= sixHoursAgo) {
          allItems.push({
            title: item.title || "",
            content: `${item.title || ""}\n${item.contentSnippet || item.content || ""}`.slice(0, 2000),
            url: item.link || "",
            author: item.creator || item.author || feed.title || "",
            published_at: item.pubDate || new Date().toISOString(),
            feed_url: feedUrl,
          });
        }
      }
    } catch (err: any) {
      console.error(`RSS feed error (${feedUrl}): ${err.message}`);
    }
  }

  return allItems;
}

/**
 * Auto-discover RSS feeds for competitor domains.
 * Checks common feed paths and logs discovered feeds.
 */
export async function discoverFeeds(
  domains: string[]
): Promise<string[]> {
  const discovered: string[] = [];
  const feedPaths = ["/feed", "/rss", "/blog/rss", "/blog/feed", "/atom.xml", "/feed.xml", "/rss.xml"];

  for (const domain of domains) {
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    for (const feedPath of feedPaths) {
      const url = `https://${cleanDomain}${feedPath}`;
      try {
        const response = await axios.head(url, { timeout: 5000 });
        const contentType = response.headers["content-type"] || "";
        if (
          contentType.includes("xml") ||
          contentType.includes("rss") ||
          contentType.includes("atom") ||
          response.status === 200
        ) {
          // Verify it's a valid feed
          await parser.parseURL(url);
          discovered.push(url);
          break; // Found a feed for this domain
        }
      } catch {
        // Skip — this path doesn't have a feed
      }
    }
  }

  // Log discoveries
  if (discovered.length > 0) {
    const logPath = path.join(ROOT_DIR, "knowledge", "log", "rss-discovery.jsonl");
    for (const feedUrl of discovered) {
      appendJsonl(
        logPath,
        {
          date: new Date().toISOString(),
          feed_url: feedUrl,
          status: "discovered",
        },
        {
          _schema: "rss_discovery",
          _version: "1.0",
          _description: "Auto-discovered RSS feeds",
        }
      );
    }
  }

  return discovered;
}

/**
 * Update knowledge.config.json with newly discovered feeds.
 */
export function addDiscoveredFeeds(newFeeds: string[]): void {
  const configPath = path.join(ROOT_DIR, "knowledge.config.json");
  if (!fs.existsSync(configPath)) return;

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const existingFeeds: string[] = config.sources?.rss?.feeds || [];
  const autoDiscovered: string[] = config.sources?.rss?.auto_discovered_feeds || [];

  const allKnown = new Set([...existingFeeds, ...autoDiscovered]);
  const trulyNew = newFeeds.filter((f) => !allKnown.has(f));

  if (trulyNew.length > 0) {
    if (!config.sources) config.sources = {};
    if (!config.sources.rss) config.sources.rss = { enabled: false, feeds: [] };
    config.sources.rss.auto_discovered_feeds = [
      ...autoDiscovered,
      ...trulyNew,
    ];
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  }
}
