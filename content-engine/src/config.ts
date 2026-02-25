import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import fs from 'fs';

// --- Model & Limits ---
export const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
export const MAX_API_CALLS_PER_RUN = 20;
export const WEEKLY_SPEND_ALERT = 10; // dollars
export const VERTICAL_SCORE_THRESHOLD = 0.7;

// --- Scanner Config ---
export const SUBREDDITS = [
  'ClaudeAI', 'LocalLLaMA', 'MachineLearning',
  'Entrepreneur', 'sales', 'copywriting', 'marketing',
];

export const REDDIT_QUERIES = [
  'context engineering', 'AI memory', 'MCP server',
  'Claude Desktop', 'keep explaining to Claude', 'prompt engineering tips',
];

export const HN_QUERIES = [
  'MCP', 'Claude context', 'context engineering', 'personal AI',
];

// --- Paths ---
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const CONTENT_DIR = path.join(ROOT_DIR, 'content');
export const VERTICALS_FILE = path.join(DATA_DIR, 'verticals.jsonl');
export const PUBLISHED_FILE = path.join(DATA_DIR, 'published.jsonl');
export const QUEUE_FILE = path.join(DATA_DIR, 'queue.jsonl');
export const COSTS_FILE = path.join(DATA_DIR, 'api-costs.jsonl');

// --- Types ---
export interface VerticalSignal {
  vertical: string;
  pain_expressed: string;
  keyword_opportunity: string;
  search_volume_estimate: 'low' | 'medium' | 'high';
  competition_estimate: 'none' | 'low' | 'medium';
  pack_opportunity: string;
  content_angles: string[];
  score: number;
  source_urls: string[];
  discovered_at: string;
  processed: boolean;
}

export interface ContentPiece {
  type: 'blog' | 'landing' | 'thread' | 'pack' | 'reddit-post' | 'hn-comment';
  vertical: string;
  slug: string;
  title: string;
  published_at: string;
  file_path: string;
}

export interface QueueItem {
  id: string;
  type: 'reddit-post' | 'reddit-comment' | 'hn-comment';
  platform: string;
  subreddit?: string;
  url?: string;
  title: string;
  body: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  vertical: string;
}

export interface CostEntry {
  timestamp: string;
  operation: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export interface RawSignal {
  source: 'reddit' | 'hn';
  title: string;
  body: string;
  url: string;
  score: number;
  subreddit?: string;
}

// --- Helpers ---
export function getAnthropicClient(): Anthropic {
  return new Anthropic();
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function appendJsonl(filePath: string, data: Record<string, unknown>): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(data) + '\n');
}

export function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as T);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Cost estimation: Sonnet input ~$3/MTok, output ~$15/MTok
export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
}

export function logCost(operation: string, inputTokens: number, outputTokens: number): void {
  const entry: CostEntry = {
    timestamp: new Date().toISOString(),
    operation,
    model: ANTHROPIC_MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost: estimateCost(inputTokens, outputTokens),
  };
  appendJsonl(COSTS_FILE, entry as unknown as Record<string, unknown>);
}

export function getWeeklyCost(): number {
  const costs = readJsonl<CostEntry>(COSTS_FILE);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return costs
    .filter(c => c.timestamp > weekAgo)
    .reduce((sum, c) => sum + c.estimated_cost, 0);
}
