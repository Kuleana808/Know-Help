import { HN_QUERIES, RawSignal } from '../config';

interface HNHit {
  comment_text?: string;
  story_title?: string;
  title?: string;
  objectID: string;
  points?: number;
  num_comments?: number;
  url?: string;
}

interface HNResponse {
  hits: HNHit[];
}

async function fetchHNSearch(query: string): Promise<RawSignal[]> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=comment&hitsPerPage=50`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`HN Algolia API ${response.status} for q="${query}"`);
      return [];
    }

    const data = (await response.json()) as HNResponse;

    return data.hits
      .filter(hit => hit.comment_text && hit.comment_text.length > 50)
      .map((hit): RawSignal => ({
        source: 'hn',
        title: hit.story_title || hit.title || '',
        body: (hit.comment_text || '').replace(/<[^>]*>/g, '').slice(0, 2000),
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        score: hit.points || 0,
      }));
  } catch (err) {
    console.warn(`HN fetch failed for "${query}": ${err}`);
    return [];
  }
}

export async function scanHN(): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  for (const query of HN_QUERIES) {
    const results = await fetchHNSearch(query);

    for (const signal of results) {
      if (!seen.has(signal.url)) {
        seen.add(signal.url);
        signals.push(signal);
      }
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Also search stories (not just comments)
  for (const query of HN_QUERIES) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=25`;

    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = (await response.json()) as HNResponse;
        for (const hit of data.hits) {
          const storyUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
          if (!seen.has(storyUrl)) {
            seen.add(storyUrl);
            signals.push({
              source: 'hn',
              title: hit.title || '',
              body: '',
              url: storyUrl,
              score: hit.points || 0,
            });
          }
        }
      }
    } catch {
      // continue
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[HN] Found ${signals.length} unique signals`);
  return signals;
}
