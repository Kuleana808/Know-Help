import { scanReddit } from './reddit';
import { scanHN } from './hn';
import {
  RawSignal,
  VerticalSignal,
  ANTHROPIC_MODEL,
  VERTICAL_SCORE_THRESHOLD,
  VERTICALS_FILE,
  getAnthropicClient,
  appendJsonl,
  readJsonl,
  logCost,
} from '../config';

function formatSignalsForPrompt(signals: RawSignal[]): string {
  return signals
    .map((s, i) => {
      const parts = [`[${i + 1}] Source: ${s.source}${s.subreddit ? ` (r/${s.subreddit})` : ''}`];
      if (s.title) parts.push(`Title: ${s.title}`);
      if (s.body) parts.push(`Body: ${s.body.slice(0, 500)}`);
      parts.push(`URL: ${s.url}`);
      parts.push(`Score: ${s.score}`);
      return parts.join('\n');
    })
    .join('\n\n---\n\n');
}

export async function extractVerticals(signals: RawSignal[]): Promise<VerticalSignal[]> {
  if (signals.length === 0) {
    console.log('[Orchestrator] No signals to process');
    return [];
  }

  const client = getAnthropicClient();
  const formattedSignals = formatSignalsForPrompt(signals);

  const systemPrompt = `You are identifying market verticals with unmet demand for AI context engineering tools.

"Context engineering" means designing the information architecture that AI models work with — structured knowledge bases, trigger-based context loading, persistent memory across sessions.

know.help is a platform that gives AI a persistent, modular knowledge base. It uses MCP (Model Context Protocol) to load the right context automatically.

Analyze the signals and identify distinct professional verticals where people are expressing pain about:
- Having to re-explain their context to AI every session
- AI not knowing about their specific industry/role
- Wanting persistent AI memory for their workflow
- Needing structured context for their domain

Be specific about the vertical (e.g., "real estate agents" not just "real estate").`;

  const userPrompt = `Here are signals from Reddit and HN this week:

${formattedSignals}

For each distinct vertical you identify, return JSON:
{
  "vertical": "specific job title or industry practitioner",
  "pain_expressed": "exact pain in their words from the signals",
  "keyword_opportunity": "low-competition long-tail keyword to target, format: 'Claude MCP for [vertical]' or 'AI context for [vertical]'",
  "search_volume_estimate": "low | medium | high",
  "competition_estimate": "none | low | medium",
  "pack_opportunity": "Name of knowledge pack to create — [Vertical] Pack with 3 specific file types",
  "content_angles": ["angle 1 — specific blog post title", "angle 2", "angle 3"],
  "score": 0.0-1.0,
  "source_urls": ["urls from signals that informed this vertical"]
}

Return a JSON array of all verticals found. Score based on:
- Pain specificity (vague = low, exact quotes = high)
- Signal volume (1 mention = low, 5+ = high)
- Keyword gap (existing content = low, no one targeting = high)
- Pack viability (clear file structure = high)

Score >0.7 means we should act on it this week.

Return ONLY the JSON array, no other text.`;

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('');

    logCost(
      'vertical-extraction',
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[Orchestrator] Could not parse JSON from response');
      return [];
    }

    const verticals: VerticalSignal[] = JSON.parse(jsonMatch[0]).map(
      (v: Omit<VerticalSignal, 'discovered_at' | 'processed'>) => ({
        ...v,
        discovered_at: new Date().toISOString(),
        processed: false,
      }),
    );

    console.log(`[Orchestrator] Extracted ${verticals.length} verticals (${verticals.filter(v => v.score >= VERTICAL_SCORE_THRESHOLD).length} above threshold)`);

    return verticals;
  } catch (err) {
    console.error(`[Orchestrator] Claude API error: ${err}`);
    return [];
  }
}

export async function runFullScan(): Promise<VerticalSignal[]> {
  console.log('=== Running Full Vertical Scan ===\n');

  // Run scanners in parallel
  const [redditSignals, hnSignals] = await Promise.all([
    scanReddit(),
    scanHN(),
  ]);

  const allSignals = [...redditSignals, ...hnSignals];
  console.log(`\n[Orchestrator] Total signals: ${allSignals.length}`);

  if (allSignals.length === 0) {
    console.log('[Orchestrator] No signals found — skipping extraction');
    return [];
  }

  // Extract verticals via Claude
  const verticals = await extractVerticals(allSignals);

  // Check for duplicates against existing verticals
  const existing = readJsonl<VerticalSignal>(VERTICALS_FILE);
  const existingNames = new Set(existing.map(v => v.vertical.toLowerCase()));

  const newVerticals = verticals.filter(v => !existingNames.has(v.vertical.toLowerCase()));

  // Append new verticals to file
  for (const vertical of newVerticals) {
    appendJsonl(VERTICALS_FILE, vertical as unknown as Record<string, unknown>);
  }

  console.log(`\n[Orchestrator] ${newVerticals.length} new verticals written to ${VERTICALS_FILE}`);
  console.log(`[Orchestrator] ${newVerticals.filter(v => v.score >= VERTICAL_SCORE_THRESHOLD).length} above score threshold (${VERTICAL_SCORE_THRESHOLD})`);

  return newVerticals;
}

export function getUnprocessedVerticals(limit = 3): VerticalSignal[] {
  const verticals = readJsonl<VerticalSignal>(VERTICALS_FILE);
  return verticals
    .filter(v => !v.processed && v.score >= VERTICAL_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function markVerticalProcessed(verticalName: string): void {
  const verticals = readJsonl<VerticalSignal>(VERTICALS_FILE);
  const updated = verticals.map(v =>
    v.vertical.toLowerCase() === verticalName.toLowerCase()
      ? { ...v, processed: true }
      : v,
  );

  // Rewrite the file
  const fs = require('fs');
  fs.writeFileSync(
    VERTICALS_FILE,
    updated.map(v => JSON.stringify(v)).join('\n') + '\n',
  );
}
