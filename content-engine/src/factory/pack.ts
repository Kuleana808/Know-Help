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

function buildPackPrompt(vertical: VerticalSignal): string {
  return `Generate a starter knowledge pack for know.help's marketplace.

Vertical: ${vertical.vertical}
Pack name: ${vertical.pack_opportunity}

Create the following files with real, useful content (not templates — actual methodology):

1. pack.json — metadata with these exact fields:
{
  "name": "${vertical.pack_opportunity}",
  "slug": "${slugify(vertical.pack_opportunity)}",
  "vertical": "${vertical.vertical}",
  "price": 19,
  "category": "[appropriate category]",
  "description": "[one-line description]",
  "files": ["list of all .md files in this pack"],
  "version": "1.0.0"
}

2. PREVIEW.md — what buyers see before purchasing (200 words, sells the pack). Start with:
---
Pack: ${vertical.pack_opportunity}
Price: $19
Vertical: ${vertical.vertical}
---

3. core/${slugify(vertical.vertical)}-identity.md — identity file template for someone in ${vertical.vertical}. Must start with:
---
Load for: ${vertical.vertical}, identity, background, role
---

4. A domain-specific methodology file at [domain]/methodology.md. Must start with:
---
Load for: methodology, process, framework, ${vertical.vertical}
---

5. A domain-specific ICP file at [domain]/icp.md. Must start with:
---
Load for: ICP, ideal customer, target, ${vertical.vertical}
---

Every .md file must have a "Load for:" trigger header in frontmatter.
Content must be specific enough that someone in ${vertical.vertical} would recognize it as accurate.
Do not write placeholder text. Write real content.

Output each file separated by a line that says:
=== FILE: [relative-path] ===

Then the complete file contents.`;
}

function parsePackResponse(text: string): Map<string, string> {
  const files = new Map<string, string>();
  const parts = text.split(/===\s*FILE:\s*(.*?)\s*===/);

  // parts[0] is before first separator, then alternating: path, content
  for (let i = 1; i < parts.length; i += 2) {
    const filePath = parts[i].trim();
    const content = (parts[i + 1] || '').trim();
    if (filePath && content) {
      files.set(filePath, content);
    }
  }

  return files;
}

export async function generatePack(vertical: VerticalSignal): Promise<ContentPiece | null> {
  const client = getAnthropicClient();
  const prompt = buildPackPrompt(vertical);

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 6144,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('');

    logCost('pack-generation', response.usage.input_tokens, response.usage.output_tokens);

    const files = parsePackResponse(text);
    if (files.size === 0) {
      console.error(`[Pack] Could not parse files from response for "${vertical.vertical}"`);
      return null;
    }

    const packSlug = slugify(vertical.pack_opportunity);
    const packDir = path.join(CONTENT_DIR, 'packs', packSlug);
    ensureDir(packDir);

    for (const [filePath, content] of files) {
      const fullPath = path.join(packDir, filePath);
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, content);
    }

    const piece: ContentPiece = {
      type: 'pack',
      vertical: vertical.vertical,
      slug: packSlug,
      title: vertical.pack_opportunity,
      published_at: new Date().toISOString(),
      file_path: packDir,
    };

    appendJsonl(PUBLISHED_FILE, piece as unknown as Record<string, unknown>);
    console.log(`[Pack] Generated: ${packSlug}/ with ${files.size} files for "${vertical.vertical}"`);

    return piece;
  } catch (err) {
    console.error(`[Pack] API error for "${vertical.vertical}": ${err}`);
    return null;
  }
}

export async function runPackFactory(limit = 3): Promise<ContentPiece[]> {
  const verticals = getUnprocessedVerticals(limit);
  console.log(`[Pack Factory] Processing ${verticals.length} verticals`);

  const pieces: ContentPiece[] = [];
  for (const vertical of verticals) {
    const piece = await generatePack(vertical);
    if (piece) pieces.push(piece);
  }

  return pieces;
}
