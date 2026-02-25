import {
  VerticalSignal,
  QueueItem,
  ANTHROPIC_MODEL,
  QUEUE_FILE,
  getAnthropicClient,
  appendJsonl,
  logCost,
  slugify,
} from '../config';
import { getUnprocessedVerticals } from '../scanner/orchestrator';

function buildRedditPostPrompt(vertical: VerticalSignal): string {
  return `You are drafting a Reddit post for r/ClaudeAI (or a relevant subreddit) about how ${vertical.vertical} can use AI context engineering to solve their workflow problems.

Vertical: ${vertical.vertical}
Pain point: ${vertical.pain_expressed}
Keyword: ${vertical.keyword_opportunity}

Write a Reddit post that:
1. Sounds like a genuine practitioner sharing a discovery, NOT marketing
2. Opens with a relatable problem specific to ${vertical.vertical}
3. Describes the solution (structured context for AI) with a concrete example
4. Mentions know.help naturally at the end — "I've been using know.help (open source on GitHub)" — NOT as a sales pitch
5. Is 200-400 words
6. Uses Reddit formatting (paragraphs, no headers)
7. Has a compelling title that would get upvotes in the subreddit

Also draft a shorter version (100-150 words) that could be used as a comment reply to someone asking about AI context management.

Output format:

=== POST ===
SUBREDDIT: [most relevant subreddit]
TITLE: [post title]
BODY:
[full post body]

=== COMMENT ===
CONTEXT: [type of thread this would reply to]
BODY:
[comment body]`;
}

interface ParsedRedditDraft {
  post: { subreddit: string; title: string; body: string };
  comment: { context: string; body: string };
}

function parseRedditResponse(text: string): ParsedRedditDraft | null {
  const postMatch = text.match(/===\s*POST\s*===\s*\n(?:SUBREDDIT:\s*(.*)\n)?TITLE:\s*(.*)\nBODY:\s*\n([\s\S]*?)(?====\s*COMMENT|$)/);
  const commentMatch = text.match(/===\s*COMMENT\s*===\s*\n(?:CONTEXT:\s*(.*)\n)?BODY:\s*\n([\s\S]*?)$/);

  if (!postMatch) return null;

  return {
    post: {
      subreddit: postMatch[1]?.trim() || 'ClaudeAI',
      title: postMatch[2]?.trim() || '',
      body: postMatch[3]?.trim() || '',
    },
    comment: {
      context: commentMatch?.[1]?.trim() || '',
      body: commentMatch?.[2]?.trim() || '',
    },
  };
}

export async function generateRedditDrafts(vertical: VerticalSignal): Promise<QueueItem[]> {
  const client = getAnthropicClient();
  const prompt = buildRedditPostPrompt(vertical);

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('');

    logCost('reddit-draft', response.usage.input_tokens, response.usage.output_tokens);

    const parsed = parseRedditResponse(text);
    if (!parsed) {
      console.error(`[Reddit Draft] Could not parse response for "${vertical.vertical}"`);
      return [];
    }

    const now = new Date().toISOString();
    const items: QueueItem[] = [];

    // Post
    if (parsed.post.title && parsed.post.body) {
      const postItem: QueueItem = {
        id: `reddit-post-${slugify(vertical.vertical)}-${Date.now()}`,
        type: 'reddit-post',
        platform: 'reddit',
        subreddit: parsed.post.subreddit,
        title: parsed.post.title,
        body: parsed.post.body,
        created_at: now,
        status: 'pending',
        vertical: vertical.vertical,
      };
      appendJsonl(QUEUE_FILE, postItem as unknown as Record<string, unknown>);
      items.push(postItem);
    }

    // Comment
    if (parsed.comment.body) {
      const commentItem: QueueItem = {
        id: `reddit-comment-${slugify(vertical.vertical)}-${Date.now()}`,
        type: 'reddit-comment',
        platform: 'reddit',
        subreddit: parsed.post.subreddit,
        title: `Reply: ${parsed.comment.context}`,
        body: parsed.comment.body,
        created_at: now,
        status: 'pending',
        vertical: vertical.vertical,
      };
      appendJsonl(QUEUE_FILE, commentItem as unknown as Record<string, unknown>);
      items.push(commentItem);
    }

    console.log(`[Reddit Draft] Generated ${items.length} items for "${vertical.vertical}"`);
    return items;
  } catch (err) {
    console.error(`[Reddit Draft] API error for "${vertical.vertical}": ${err}`);
    return [];
  }
}

export async function runRedditDraftFactory(limit = 3): Promise<QueueItem[]> {
  const verticals = getUnprocessedVerticals(limit);
  console.log(`[Reddit Factory] Drafting for ${verticals.length} verticals`);

  const allItems: QueueItem[] = [];
  for (const vertical of verticals) {
    const items = await generateRedditDrafts(vertical);
    allItems.push(...items);
  }

  return allItems;
}
