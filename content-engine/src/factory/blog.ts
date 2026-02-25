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

function buildBlogPrompt(vertical: VerticalSignal, angle: string): string {
  return `You are writing for know.help — a context engineering platform for AI-first operators.

Vertical: ${vertical.vertical}
Pain point: ${vertical.pain_expressed}
Primary keyword: ${vertical.keyword_opportunity}
Angle: ${angle}

Write a 1500-word blog post optimized for the keyword "${vertical.keyword_opportunity}".

Rules:
- Opening paragraph defines "context engineering" — this term must appear in first 100 words
- Written for practitioners in ${vertical.vertical}, not developers
- Concrete and specific — use real examples from this vertical
- Never mention competitors by name
- End with one clear CTA: install know.help free via GitHub
- Structure: hook → problem → insight → solution → how-to → CTA
- Include one code block showing a sample CLAUDE.md trigger file for this vertical
- H1, H2, H3 structure for SEO
- Meta description: 155 chars max, include keyword

Output format:
---
title: [title]
slug: [url-slug]
meta_description: [155 chars]
primary_keyword: [keyword]
secondary_keywords: [comma-separated]
---
[full post content in markdown]`;
}

function parseBlogResponse(text: string): { frontmatter: Record<string, string>; content: string } | null {
  const fmMatch = text.match(/---\n([\s\S]*?)\n---\n([\s\S]*)/);
  if (!fmMatch) return null;

  const frontmatter: Record<string, string> = {};
  for (const line of fmMatch[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      frontmatter[key] = val;
    }
  }

  return { frontmatter, content: fmMatch[2].trim() };
}

export async function generateBlogPost(vertical: VerticalSignal, angleIndex = 0): Promise<ContentPiece | null> {
  const angle = vertical.content_angles[angleIndex] || vertical.content_angles[0];
  if (!angle) {
    console.error(`[Blog] No content angles for vertical "${vertical.vertical}"`);
    return null;
  }

  const client = getAnthropicClient();
  const prompt = buildBlogPrompt(vertical, angle);

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('');

    logCost('blog-generation', response.usage.input_tokens, response.usage.output_tokens);

    const parsed = parseBlogResponse(text);
    if (!parsed) {
      console.error(`[Blog] Could not parse response for "${vertical.vertical}"`);
      return null;
    }

    const slug = parsed.frontmatter.slug || slugify(parsed.frontmatter.title || vertical.keyword_opportunity);
    const blogDir = path.join(CONTENT_DIR, 'blog');
    ensureDir(blogDir);

    const filePath = path.join(blogDir, `${slug}.md`);
    fs.writeFileSync(filePath, text);

    const piece: ContentPiece = {
      type: 'blog',
      vertical: vertical.vertical,
      slug,
      title: parsed.frontmatter.title || angle,
      published_at: new Date().toISOString(),
      file_path: filePath,
    };

    appendJsonl(PUBLISHED_FILE, piece as unknown as Record<string, unknown>);
    console.log(`[Blog] Generated: ${slug}.md for "${vertical.vertical}"`);

    return piece;
  } catch (err) {
    console.error(`[Blog] API error for "${vertical.vertical}": ${err}`);
    return null;
  }
}

export async function runBlogFactory(limit = 3): Promise<ContentPiece[]> {
  const verticals = getUnprocessedVerticals(limit);
  console.log(`[Blog Factory] Processing ${verticals.length} verticals`);

  const pieces: ContentPiece[] = [];
  for (const vertical of verticals) {
    const piece = await generateBlogPost(vertical);
    if (piece) pieces.push(piece);
  }

  return pieces;
}
