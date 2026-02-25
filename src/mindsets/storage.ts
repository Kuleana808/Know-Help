import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/**
 * Mindset file storage — local filesystem with S3 interface ready for production.
 * Same pattern as src/hosted/s3.ts: local filesystem for dev, swap to @aws-sdk in prod.
 * Mindset files stored at: data/mindsets/{creator_handle}/{mindset_slug}/
 */

// Note: In production, use @aws-sdk/client-s3 (same as src/hosted/s3.ts).
// This module provides the local filesystem implementation.

const LOCAL_MINDSET_DIR =
  process.env.MINDSET_STORAGE_DIR ||
  path.join(process.env.DATA_DIR || path.join(__dirname, "..", "..", "data"), "mindsets");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function localPath(creatorHandle: string, mindsetSlug: string, filePath?: string): string {
  const base = path.join(LOCAL_MINDSET_DIR, creatorHandle, mindsetSlug);
  return filePath ? path.join(base, filePath) : base;
}

/**
 * Store a file for a published Mindset.
 */
export async function storeMindsetFile(
  creatorHandle: string,
  mindsetSlug: string,
  filePath: string,
  content: string
): Promise<void> {
  const full = localPath(creatorHandle, mindsetSlug, filePath);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, content, "utf-8");
}

/**
 * Read a Mindset file.
 */
export async function readMindsetFile(
  creatorHandle: string,
  mindsetSlug: string,
  filePath: string
): Promise<string | null> {
  const full = localPath(creatorHandle, mindsetSlug, filePath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf-8");
}

/**
 * List all files in a Mindset.
 */
export async function listMindsetFiles(
  creatorHandle: string,
  mindsetSlug: string
): Promise<string[]> {
  const base = localPath(creatorHandle, mindsetSlug);
  return walkDir(base, base);
}

/**
 * Delete a Mindset file.
 */
export async function deleteMindsetFile(
  creatorHandle: string,
  mindsetSlug: string,
  filePath: string
): Promise<void> {
  const full = localPath(creatorHandle, mindsetSlug, filePath);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

/**
 * Delete all files for a Mindset.
 */
export async function deleteAllMindsetFiles(
  creatorHandle: string,
  mindsetSlug: string
): Promise<void> {
  const base = localPath(creatorHandle, mindsetSlug);
  if (fs.existsSync(base)) {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

/**
 * Compute SHA-256 hash of file content for sync comparison.
 */
export function contentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Recursively walk a directory returning relative paths. */
function walkDir(dir: string, base: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, base));
    } else {
      results.push(path.relative(base, full));
    }
  }
  return results;
}
