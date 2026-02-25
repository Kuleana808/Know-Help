import * as os from "os";
import * as path from "path";
import * as fs from "fs";

/** Root of local Mindset storage */
export const KNOW_HELP_HOME = path.join(os.homedir(), ".know-help");

/** Installed Mindsets directory */
export const MINDSETS_DIR = path.join(KNOW_HELP_HOME, "mindsets");

/** Local subscription cache database */
export const CACHE_DB_PATH = path.join(KNOW_HELP_HOME, "cache.db");

/** Sync timestamp file */
export const SYNC_FILE = path.join(KNOW_HELP_HOME, ".sync");

/** Config file (API token, preferences) */
export const CONFIG_FILE = path.join(KNOW_HELP_HOME, "config.json");

/** User's own knowledge base directories (coexist with mindsets) */
export const CORE_DIR = path.join(KNOW_HELP_HOME, "core");
export const NETWORK_DIR = path.join(KNOW_HELP_HOME, "network");
export const VENTURE_DIR = path.join(KNOW_HELP_HOME, "venture");
export const LOG_DIR = path.join(KNOW_HELP_HOME, "log");

/** CLAUDE.md routing index */
export const CLAUDE_MD_PATH = path.join(KNOW_HELP_HOME, "CLAUDE.md");

/**
 * Ensure all ~/.know-help/ directories exist.
 */
export function ensureMindsetDirs(): void {
  const dirs = [
    KNOW_HELP_HOME,
    MINDSETS_DIR,
    CORE_DIR,
    NETWORK_DIR,
    VENTURE_DIR,
    LOG_DIR,
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Get the directory path for a specific creator's Mindset.
 */
export function mindsetDir(creatorSlug: string): string {
  return path.join(MINDSETS_DIR, creatorSlug);
}

/**
 * Get the MINDSET.md manifest path for a creator.
 */
export function mindsetManifestPath(creatorSlug: string): string {
  return path.join(MINDSETS_DIR, creatorSlug, "MINDSET.md");
}

/**
 * Validate that a path is safely within the ~/.know-help/ tree.
 * Returns the resolved absolute path, or null if traversal detected.
 */
export function resolveMindsetPath(filepath: string): string | null {
  const resolved = path.resolve(KNOW_HELP_HOME, filepath);
  if (!resolved.startsWith(KNOW_HELP_HOME + path.sep) && resolved !== KNOW_HELP_HOME) {
    return null;
  }
  return resolved;
}

/**
 * Validate that a path is safely within a specific mindset directory.
 */
export function resolveMindsetFilePath(
  creatorSlug: string,
  filepath: string
): string | null {
  const base = mindsetDir(creatorSlug);
  const resolved = path.resolve(base, filepath);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return null;
  }
  return resolved;
}

/**
 * Read and parse a MINDSET.md manifest from YAML frontmatter.
 * The manifest is the YAML block between --- delimiters at the top of MINDSET.md.
 */
export function parseMindsetManifest(
  content: string
): Record<string, any> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: Record<string, any> = {};

  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: any = line.slice(colonIdx + 1).trim();

    // Handle arrays (triggers list on same line or following lines)
    if (value === "") continue;
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  // Parse triggers as array from the full YAML block
  const triggersMatch = yaml.match(/triggers:\s*\n((?:\s+-\s+.+\n?)+)/);
  if (triggersMatch) {
    result.triggers = triggersMatch[1]
      .split("\n")
      .map((l: string) => l.replace(/^\s+-\s+/, "").trim())
      .filter(Boolean);
  }

  // Parse subscription block
  const subMatch = yaml.match(/subscription:\s*\n((?:\s+\w+:.+\n?)+)/);
  if (subMatch) {
    const sub: Record<string, any> = {};
    for (const line of subMatch[1].split("\n")) {
      const ci = line.indexOf(":");
      if (ci === -1) continue;
      const k = line.slice(0, ci).trim();
      let v: any = line.slice(ci + 1).trim();
      if (v === "true") v = true;
      if (v === "false") v = false;
      if (k) sub[k] = v;
    }
    result.subscription = sub;
  }

  return result;
}

/**
 * Recursively walk a directory and return all file paths (relative).
 */
export function walkMindsetDir(dir: string, base?: string): string[] {
  const root = base || dir;
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMindsetDir(full, root));
    } else {
      results.push(path.relative(root, full));
    }
  }
  return results;
}

/**
 * Slugify a string for use in directory names and URLs.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
