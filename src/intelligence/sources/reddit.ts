import axios from "axios";

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  url: string;
  permalink: string;
}

export interface RedditConfig {
  minUpvotes: number;
  subreddits?: string[];
}

/**
 * Search Reddit for recent posts matching query keywords.
 * Uses Reddit's public JSON API (no API key required).
 * Only returns posts from the last 6 hours with minimum upvotes.
 */
export async function searchReddit(
  query: string,
  config: RedditConfig
): Promise<RedditPost[]> {
  const { minUpvotes, subreddits } = config;
  const sixHoursAgo = Date.now() / 1000 - 6 * 60 * 60;
  const allPosts: RedditPost[] = [];

  try {
    // Search across Reddit or specific subreddits
    const searchUrls: string[] = [];

    if (subreddits && subreddits.length > 0) {
      for (const sub of subreddits) {
        searchUrls.push(
          `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(
            query
          )}&sort=new&restrict_sr=on&t=day&limit=50`
        );
      }
    } else {
      searchUrls.push(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(
          query
        )}&sort=new&t=day&limit=50`
      );
    }

    for (const url of searchUrls) {
      try {
        const response = await axios.get(url, {
          headers: {
            "User-Agent": "know-help-crawler/1.0",
          },
          timeout: 10000,
        });

        if (
          !response.data?.data?.children ||
          response.data.data.children.length === 0
        ) {
          continue;
        }

        const posts: RedditPost[] = response.data.data.children
          .map((child: any) => child.data)
          .filter((post: any) => {
            return (
              post.score >= minUpvotes &&
              post.created_utc >= sixHoursAgo
            );
          })
          .map((post: any) => ({
            id: post.id,
            title: post.title,
            selftext: post.selftext || "",
            subreddit: post.subreddit,
            author: post.author,
            score: post.score,
            num_comments: post.num_comments,
            created_utc: post.created_utc,
            url: post.url,
            permalink: `https://reddit.com${post.permalink}`,
          }));

        allPosts.push(...posts);
      } catch (err: any) {
        // Skip individual subreddit errors
        console.error(`Reddit search error for ${url}: ${err.message}`);
      }
    }

    return allPosts;
  } catch (err: any) {
    throw new Error(`Reddit search error: ${err.message}`);
  }
}
