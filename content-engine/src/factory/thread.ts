import fs from 'fs';
import path from 'path';
import {
  VerticalSignal,
  ContentPiece,
  ANTHROPIC_MODEL,
  CONTENT_DIR,
  PUBLISHED_FILE,
  getAnthropicClient,
  appendJsonl,
  ensureDir,
  slugify,
  logCost,
} from '../config';
import { getUnprocessedVerticals } from '../scanner/orchestrator';

function buildThreadPrompt(vertical: VerticalSignal, angle: string): string {
  return `Write a 10-tweet thread for know.help on the topic: "${angle}"

Audience: ${vertical.vertical} practitioners who use Claude or ChatGPT daily
Tone: practitioner sharing a genuine insight, not marketing
Format: Tweet 1 is the hook (no more than 240 chars, no hashtags). Tweets 2-9 expand the idea with specifics. Tweet 10 is the CTA (mention know.help, link to GitHub).

Rules:
- Never say "game-changer", "revolutionary", or "unlock"
- Use numbers and specifics wherever possible
- Each tweet must be able to stand alone if quote-tweeted
- Include one concrete example from ${vertical.vertical} in the thread
- The term "context engineering" must appear at least once
- Each tweet must be under 280 characters

Output format — number each tweet, separate with --- on its own line:

1. [tweet text]

---

2. [tweet text]

---

(continue through 10)`;
}

export async function generateThread(vertical: VerticalSignal, angleIndex = 0): Promise<ContentPiece | null> {
  const angle = vertical.content_angles[angleIndex] || vertical.content_angles[0];
  if (!angle) {
    console.error(`[Thread] No content angles for vertical "${vertical.vertical}"`);
    return null;
  }

  const client = getAnthropicClient();
  const prompt = buildThreadPrompt(vertical, angle);

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

    logCost('thread-generation', response.usage.input_tokens, response.usage.output_tokens);

    const date = new Date().toISOString().split('T')[0];
    const slug = slugify(angle).slice(0, 60);
    const threadsDir = path.join(CONTENT_DIR, 'threads');
    ensureDir(threadsDir);

    const filePath = path.join(threadsDir, `${date}-${slug}.md`);
    const header = `---
vertical: ${vertical.vertical}
angle: ${angle}
keyword: ${vertical.keyword_opportunity}
generated_at: ${new Date().toISOString()}
---

`;
    fs.writeFileSync(filePath, header + text);

    const piece: ContentPiece = {
      type: 'thread',
      vertical: vertical.vertical,
      slug: `${date}-${slug}`,
      title: angle,
      published_at: new Date().toISOString(),
      file_path: filePath,
    };

    appendJsonl(PUBLISHED_FILE, piece as unknown as Record<string, unknown>);
    console.log(`[Thread] Generated: ${date}-${slug}.md for "${vertical.vertical}"`);

    return piece;
  } catch (err) {
    console.error(`[Thread] API error for "${vertical.vertical}": ${err}`);
    return null;
  }
}

export async function runThreadFactory(limit = 3): Promise<ContentPiece[]> {
  const verticals = getUnprocessedVerticals(limit);
  console.log(`[Thread Factory] Generating threads for ${verticals.length} verticals`);

  const pieces: ContentPiece[] = [];
  for (const vertical of verticals) {
    // Generate one thread per vertical using the first content angle
    const piece = await generateThread(vertical, 0);
    if (piece) pieces.push(piece);
  }

  return pieces;
}
