import * as path from "path";
import * as fs from "fs";

export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const KNOWLEDGE_DIR = path.join(ROOT_DIR, "knowledge");
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, "data");

export function ensureKnowledgeDir(): void {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    const initScript = path.join(ROOT_DIR, "scripts", "init-knowledge.js");
    if (fs.existsSync(initScript)) {
      require(initScript);
    } else {
      fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
    }
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isPathSafe(filepath: string): boolean {
  const resolved = path.resolve(KNOWLEDGE_DIR, filepath);
  return (
    resolved.startsWith(KNOWLEDGE_DIR + path.sep) ||
    resolved === KNOWLEDGE_DIR
  );
}

export function resolveKnowledgePath(filepath: string): string | null {
  const cleaned = filepath.replace(/^knowledge\//, "");
  const resolved = path.resolve(KNOWLEDGE_DIR, cleaned);
  if (
    !resolved.startsWith(KNOWLEDGE_DIR + path.sep) &&
    resolved !== KNOWLEDGE_DIR
  ) {
    return null;
  }
  return resolved;
}

export function walkDir(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
