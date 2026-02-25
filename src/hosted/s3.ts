/**
 * S3 file operations for hosted knowledge bases.
 * Each user gets an isolated prefix: users/{user_id}/knowledge/
 */

// Note: In production, use @aws-sdk/client-s3.
// This module provides the interface and a local filesystem fallback for development.
import * as fs from "fs";
import * as path from "path";

const S3_BUCKET = process.env.S3_BUCKET || "";
const USE_LOCAL = !S3_BUCKET || process.env.NODE_ENV === "development";
const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "..", "..", "data", "hosted");

export interface S3FileOps {
  read(userPrefix: string, filePath: string): Promise<string>;
  append(userPrefix: string, filePath: string, content: string): Promise<void>;
  write(userPrefix: string, filePath: string, content: string): Promise<void>;
  list(userPrefix: string, prefix?: string): Promise<string[]>;
  delete(userPrefix: string, filePath: string): Promise<void>;
  exists(userPrefix: string, filePath: string): Promise<boolean>;
}

/**
 * Validate that a resolved path stays within its base directory.
 * Prevents path traversal attacks via ".." segments.
 */
function safePath(base: string, ...segments: string[]): string {
  const resolved = path.resolve(base, ...segments);
  const resolvedBase = path.resolve(base);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

function localPath(userPrefix: string, filePath: string): string {
  return safePath(LOCAL_STORAGE_DIR, userPrefix, filePath);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Local filesystem implementation (dev/fallback).
 * In production, swap with real S3 calls using conditional writes (If-Match on ETag).
 */
export const s3Ops: S3FileOps = {
  async read(userPrefix: string, filePath: string): Promise<string> {
    const full = localPath(userPrefix, filePath);
    if (!fs.existsSync(full)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return fs.readFileSync(full, "utf-8");
  },

  async append(userPrefix: string, filePath: string, content: string): Promise<void> {
    const full = localPath(userPrefix, filePath);
    ensureDir(full);
    if (fs.existsSync(full)) {
      fs.appendFileSync(full, content, "utf-8");
    } else {
      fs.writeFileSync(full, content, "utf-8");
    }
  },

  async write(userPrefix: string, filePath: string, content: string): Promise<void> {
    const full = localPath(userPrefix, filePath);
    ensureDir(full);
    fs.writeFileSync(full, content, "utf-8");
  },

  async list(userPrefix: string, prefix?: string): Promise<string[]> {
    const baseDir = safePath(LOCAL_STORAGE_DIR, userPrefix, prefix || "");
    if (!fs.existsSync(baseDir)) return [];

    const results: string[] = [];
    function walk(dir: string): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          results.push(path.relative(path.join(LOCAL_STORAGE_DIR, userPrefix), full));
        }
      }
    }
    walk(baseDir);
    return results;
  },

  async delete(userPrefix: string, filePath: string): Promise<void> {
    const full = localPath(userPrefix, filePath);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
    }
  },

  async exists(userPrefix: string, filePath: string): Promise<boolean> {
    return fs.existsSync(localPath(userPrefix, filePath));
  },
};

/**
 * Copy the knowledge scaffold to a new user's prefix.
 */
export async function initUserKnowledge(userPrefix: string): Promise<void> {
  const scaffoldDir = path.join(__dirname, "..", "..", "knowledge");
  if (!fs.existsSync(scaffoldDir)) return;

  function copyDir(src: string, relativePath: string): void {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const relPath = path.join(relativePath, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, relPath);
      } else {
        const content = fs.readFileSync(srcPath, "utf-8");
        const full = localPath(userPrefix, relPath);
        ensureDir(full);
        if (!fs.existsSync(full)) {
          fs.writeFileSync(full, content, "utf-8");
        }
      }
    }
  }

  copyDir(scaffoldDir, "");
}
