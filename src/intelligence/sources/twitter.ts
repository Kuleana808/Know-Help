import axios from "axios";

export interface Tweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
  };
  source_url: string;
}

export interface TwitterConfig {
  bearerToken: string;
  minEngagement: number;
}

/**
 * Search Twitter/X for recent tweets matching query keywords.
 * Uses Twitter API v2 Search API.
 * Only returns tweets from the last 6 hours with minimum engagement.
 */
export async function searchTwitter(
  query: string,
  config: TwitterConfig
): Promise<Tweet[]> {
  const { bearerToken, minEngagement } = config;

  if (!bearerToken) {
    throw new Error("TWITTER_BEARER_TOKEN is not set");
  }

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const startTime = sixHoursAgo.toISOString();

  try {
    const response = await axios.get(
      "https://api.twitter.com/2/tweets/search/recent",
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
        params: {
          query: `${query} -is:retweet lang:en`,
          "tweet.fields": "created_at,public_metrics,author_id",
          max_results: 50,
          start_time: startTime,
        },
      }
    );

    if (!response.data.data) {
      return [];
    }

    const tweets: Tweet[] = response.data.data
      .filter((tweet: any) => {
        const metrics = tweet.public_metrics || {};
        const engagement =
          (metrics.like_count || 0) + (metrics.retweet_count || 0);
        return engagement >= minEngagement;
      })
      .map((tweet: any) => ({
        id: tweet.id,
        text: tweet.text,
        author_id: tweet.author_id,
        created_at: tweet.created_at,
        public_metrics: tweet.public_metrics,
        source_url: `https://twitter.com/i/web/status/${tweet.id}`,
      }));

    return tweets;
  } catch (err: any) {
    if (err.response?.status === 429) {
      console.error("Twitter API rate limited. Skipping.");
      return [];
    }
    throw new Error(`Twitter API error: ${err.message}`);
  }
}
