import axios from "axios";

export interface LinkedInPost {
  text: string;
  author: string;
  url: string;
  reactions: number;
  published_at: string;
}

export interface LinkedInConfig {
  apifyToken: string;
  minEngagement: number;
}

/**
 * Search LinkedIn for recent posts matching query keywords.
 * Uses Apify's linkedin-post-search actor.
 */
export async function searchLinkedIn(
  query: string,
  config: LinkedInConfig
): Promise<LinkedInPost[]> {
  const { apifyToken, minEngagement } = config;

  if (!apifyToken) {
    throw new Error("APIFY_API_TOKEN is not set");
  }

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  try {
    const response = await axios.post(
      "https://api.apify.com/v2/acts/apify~linkedin-post-search/run-sync-get-dataset-items",
      {
        queries: [query],
        maxResults: 50,
        dateFrom: sixHoursAgo.toISOString(),
      },
      {
        headers: { Authorization: `Bearer ${apifyToken}` },
        timeout: 60000,
      }
    );

    if (!response.data || !Array.isArray(response.data)) {
      return [];
    }

    return response.data
      .filter((post: any) => {
        const reactions = post.reactionCount || post.numLikes || 0;
        return reactions >= minEngagement;
      })
      .map((post: any) => ({
        text: post.text || post.content || "",
        author: post.authorName || post.author || "Unknown",
        url: post.url || post.postUrl || "",
        reactions: post.reactionCount || post.numLikes || 0,
        published_at: post.postedAt || post.publishedAt || new Date().toISOString(),
      }));
  } catch (err: any) {
    if (err.response?.status === 402) {
      console.error("Apify credits exhausted for LinkedIn search.");
      return [];
    }
    throw new Error(`LinkedIn search error: ${err.message}`);
  }
}
