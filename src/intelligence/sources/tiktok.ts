import axios from "axios";

export interface TikTokVideo {
  description: string;
  author: string;
  url: string;
  views: number;
  published_at: string;
}

export interface TikTokConfig {
  apifyToken: string;
  minViews: number;
}

/**
 * Search TikTok for recent videos matching query keywords/hashtags.
 * Uses Apify's clockworks/tiktok-scraper actor.
 */
export async function searchTikTok(
  query: string,
  config: TikTokConfig
): Promise<TikTokVideo[]> {
  const { apifyToken, minViews } = config;

  if (!apifyToken) {
    throw new Error("APIFY_API_TOKEN is not set");
  }

  // Convert search terms to hashtags
  const hashtags = query
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((term) => term.replace(/^#/, ""))
    .slice(0, 5);

  try {
    const response = await axios.post(
      "https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items",
      {
        hashtags,
        resultsPerPage: 30,
        shouldDownloadVideos: false,
      },
      {
        headers: { Authorization: `Bearer ${apifyToken}` },
        timeout: 90000,
      }
    );

    if (!response.data || !Array.isArray(response.data)) {
      return [];
    }

    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

    return response.data
      .filter((video: any) => {
        const views = video.playCount || video.views || 0;
        const created = video.createTime
          ? video.createTime * 1000
          : Date.now();
        return views >= minViews && created >= twentyFourHoursAgo;
      })
      .map((video: any) => ({
        description: video.text || video.desc || "",
        author: video.authorMeta?.name || video.author || "Unknown",
        url: video.webVideoUrl || `https://www.tiktok.com/@${video.authorMeta?.name}/video/${video.id}`,
        views: video.playCount || video.views || 0,
        published_at: video.createTime
          ? new Date(video.createTime * 1000).toISOString()
          : new Date().toISOString(),
      }));
  } catch (err: any) {
    if (err.response?.status === 402) {
      console.error("Apify credits exhausted for TikTok search.");
      return [];
    }
    throw new Error(`TikTok search error: ${err.message}`);
  }
}
