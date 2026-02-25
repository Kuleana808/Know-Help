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

function buildLandingPrompt(vertical: VerticalSignal): string {
  return `You are generating a landing page for know.help targeting a specific vertical.

Vertical: ${vertical.vertical}
Keyword: ${vertical.keyword_opportunity}
Pack name: ${vertical.pack_opportunity}
Pain point: ${vertical.pain_expressed}

Generate a vertical landing page in the exact HTML style of know.help:
- Background: #f5f2eb (parchment)
- Accent: #1a4a2e (forest green), hover: #1f6038
- Fonts: Playfair Display for headings, IBM Plex Mono for body
- Border-based grid layout (1px solid #d8d3c8)
- All CSS must be inlined in a <style> tag

Page sections:
1. Hero: headline addresses ${vertical.vertical} specifically. Example: "The context engineering setup every ${vertical.vertical} needs."
2. Problem: 2 pain points specific to ${vertical.vertical} workflow with AI
3. Solution: how know.help solves it with a sample knowledge file structure for ${vertical.vertical}
4. Pack preview: showcase the ${vertical.pack_opportunity} with 3 sample files it includes
5. How it works: 3-step install (GitHub → configure → Claude Desktop)
6. CTA: Install free on GitHub + notify me for Pro

Include real, vertical-specific examples in every section. Do not use generic AI copy.

The page must include these Google Font links:
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@300;400&display=swap" rel="stylesheet" />

Include meta tags:
- title: "know.help for ${vertical.vertical} — Context engineering for AI-first ${vertical.vertical}"
- description: 155 chars max, include the keyword "${vertical.keyword_opportunity}"
- og:title and og:description

The install CTA link should be: https://github.com/know-help/know-help
The Pro notify link should anchor to: #notify

Output ONLY the complete HTML document, nothing else.`;
}

export async function generateLandingPage(vertical: VerticalSignal): Promise<ContentPiece | null> {
  const client = getAnthropicClient();
  const prompt = buildLandingPrompt(vertical);

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('');

    logCost('landing-generation', response.usage.input_tokens, response.usage.output_tokens);

    // Extract HTML from response (may be wrapped in code blocks)
    let html = text;
    const htmlMatch = text.match(/```html?\n([\s\S]*?)```/);
    if (htmlMatch) {
      html = htmlMatch[1];
    } else if (!text.includes('<!DOCTYPE') && !text.includes('<html')) {
      console.error(`[Landing] Response doesn't contain HTML for "${vertical.vertical}"`);
      return null;
    }

    const slug = slugify(vertical.vertical);
    const pagesDir = path.join(CONTENT_DIR, 'pages');
    ensureDir(pagesDir);

    const filePath = path.join(pagesDir, `for-${slug}.html`);
    fs.writeFileSync(filePath, html);

    const piece: ContentPiece = {
      type: 'landing',
      vertical: vertical.vertical,
      slug: `for-${slug}`,
      title: `know.help for ${vertical.vertical}`,
      published_at: new Date().toISOString(),
      file_path: filePath,
    };

    appendJsonl(PUBLISHED_FILE, piece as unknown as Record<string, unknown>);
    console.log(`[Landing] Generated: for-${slug}.html for "${vertical.vertical}"`);

    return piece;
  } catch (err) {
    console.error(`[Landing] API error for "${vertical.vertical}": ${err}`);
    return null;
  }
}

export async function runLandingFactory(limit = 3): Promise<ContentPiece[]> {
  const verticals = getUnprocessedVerticals(limit);
  console.log(`[Landing Factory] Processing ${verticals.length} verticals`);

  const pieces: ContentPiece[] = [];
  for (const vertical of verticals) {
    const piece = await generateLandingPage(vertical);
    if (piece) pieces.push(piece);
  }

  return pieces;
}
