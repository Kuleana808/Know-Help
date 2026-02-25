import { SUBREDDITS, REDDIT_QUERIES, RawSignal } from '../config';

interface RedditPost {
  data: {
    title: string;
    selftext: string;
    permalink: string;
    score: number;
    subreddit: string;
    num_comments: number;
  };
}

interface RedditResponse {
  data: {
    children: RedditPost[];
  };
}

async function fetchRedditSearch(subreddit: string, query: string): Promise<RawSignal[]> {
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25&restrict_sr=1`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'know.help-content-engine/1.0' },
    });

    if (!response.ok) {
      console.warn(`Reddit API ${response.status} for r/${subreddit} q="${query}"`);
      return [];
    }

    const data = (await response.json()) as RedditResponse;

    return data.data.children.map((post): RawSignal => ({
      source: 'reddit',
      title: post.data.title,
      body: post.data.selftext.slice(0, 2000),
      url: `https://www.reddit.com${post.data.permalink}`,
      score: post.data.score,
      subreddit: post.data.subreddit,
    }));
  } catch (err) {
    console.warn(`Reddit fetch failed for r/${subreddit}: ${err}`);
    return [];
  }
}

export async function scanReddit(): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  for (const subreddit of SUBREDDITS) {
    for (const query of REDDIT_QUERIES) {
      const results = await fetchRedditSearch(subreddit, query);

      for (const signal of results) {
        if (!seen.has(signal.url)) {
          seen.add(signal.url);
          signals.push(signal);
        }
      }

      // Rate limit: Reddit wants ~1 req/sec for unauthenticated
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }

  console.log(`[Reddit] Found ${signals.length} unique signals across ${SUBREDDITS.length} subreddits`);
  return signals;
}
