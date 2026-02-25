/**
 * know.help MCP server — automated test suite
 * Runs as part of CI. Tests all core logic without requiring MCP transport.
 */
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const KNOWLEDGE_DIR = path.join(ROOT_DIR, "knowledge");

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.log(`  \u2717 FAIL: ${name}`);
  }
}

// ── Helpers (mirrored from src/index.ts) ───────────────────────────

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractTriggerKeywords(content) {
  const match = content.match(/^---\s*\n[\s\S]*?Load for:\s*(.+)/m);
  if (match && match[1]) {
    return match[1].split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function extractJsonlSchema(content) {
  const firstLine = content.split("\n")[0];
  try {
    const parsed = JSON.parse(firstLine);
    if (parsed._schema) return { schema: parsed._schema, description: parsed._description || "" };
  } catch {}
  return null;
}

function isPathSafe(filepath) {
  const resolved = path.resolve(KNOWLEDGE_DIR, filepath);
  return resolved.startsWith(KNOWLEDGE_DIR + path.sep) || resolved === KNOWLEDGE_DIR;
}

function walkDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(fullPath));
    else results.push(fullPath);
  }
  return results;
}

function searchKnowledge(query) {
  const queryTerms = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const allFiles = walkDir(KNOWLEDGE_DIR);
  const matches = [];
  for (const file of allFiles) {
    const rel = path.relative(KNOWLEDGE_DIR, file);
    if (path.extname(file) !== ".md") continue;
    const content = fs.readFileSync(file, "utf-8");
    const keywords = extractTriggerKeywords(content);
    let score = 0;
    for (const term of queryTerms) {
      for (const kw of keywords) {
        if (term.length < 2 || kw.length < 2) {
          if (term === kw) score++;
        } else if (kw.includes(term) || term.includes(kw)) {
          score++;
        }
      }
    }
    if (score > 0) matches.push({ path: rel, score });
  }
  return matches.sort((a, b) => b.score - a.score);
}

// ── Test Suite ─────────────────────────────────────────────────────

console.log("\n=== 1. Build ===");
try {
  execSync("npm run build", { cwd: ROOT_DIR, stdio: "pipe" });
  assert(true, "TypeScript compiles with zero errors");
} catch (e) {
  assert(false, "TypeScript compiles with zero errors: " + e.stderr?.toString());
}
assert(fs.existsSync(path.join(ROOT_DIR, "dist", "index.js")), "dist/index.js exists");
const distContent = fs.readFileSync(path.join(ROOT_DIR, "dist", "index.js"), "utf-8");
assert(distContent.startsWith("#!/usr/bin/env node"), "dist/index.js has shebang line");

console.log("\n=== 2. Knowledge directory structure ===");
assert(fs.existsSync(KNOWLEDGE_DIR), "knowledge/ directory exists");
const expectedDirs = ["communication", "core", "log", "network", "planning", "platform", "sales", "venture"];
for (const d of expectedDirs) {
  assert(fs.existsSync(path.join(KNOWLEDGE_DIR, d)), `knowledge/${d}/ exists`);
}

console.log("\n=== 3. Trigger keyword extraction ===");
const allFiles = walkDir(KNOWLEDGE_DIR);
const mdFiles = allFiles.filter((f) => path.extname(f) === ".md" && !f.endsWith("CLAUDE.md"));
assert(mdFiles.length >= 10, `At least 10 markdown knowledge files (found ${mdFiles.length})`);
let filesWithTriggers = 0;
for (const f of mdFiles) {
  const kw = extractTriggerKeywords(fs.readFileSync(f, "utf-8"));
  if (kw.length > 0) filesWithTriggers++;
}
assert(filesWithTriggers >= 10, `At least 10 files have trigger keywords (found ${filesWithTriggers})`);

console.log("\n=== 4. JSONL schema validation ===");
const jsonlFiles = allFiles.filter((f) => path.extname(f) === ".jsonl");
for (const f of jsonlFiles) {
  const rel = path.relative(KNOWLEDGE_DIR, f);
  const content = fs.readFileSync(f, "utf-8");
  const lines = content.trim().split("\n");
  let allValid = true;
  for (let i = 0; i < lines.length; i++) {
    try { JSON.parse(lines[i]); } catch { allValid = false; }
  }
  assert(allValid, `${rel}: all lines are valid JSON`);
  const schema = extractJsonlSchema(content);
  assert(schema !== null, `${rel}: has _schema declaration`);
}

console.log("\n=== 5. Path traversal protection ===");
assert(isPathSafe("core/identity.md") === true, "allows core/identity.md");
assert(isPathSafe("../package.json") === false, "blocks ../package.json");
assert(isPathSafe("../../etc/passwd") === false, "blocks ../../etc/passwd");
assert(isPathSafe("/etc/passwd") === false, "blocks /etc/passwd");
assert(isPathSafe("core/../../package.json") === false, "blocks core/../../package.json");

console.log("\n=== 6. Slugify ===");
assert(slugify("John Doe") === "john-doe", "John Doe → john-doe");
assert(slugify("José García") === "jose-garcia", "José García → jose-garcia (accents normalized)");
assert(slugify("François Müller") === "francois-muller", "François Müller → francois-muller");
assert(slugify("Naïve café") === "naive-cafe", "Naïve café → naive-cafe");

console.log("\n=== 7. Search accuracy ===");
assert(searchKnowledge("sales").length >= 1, '"sales" finds sales files');
assert(searchKnowledge("identity").length >= 1, '"identity" finds identity files');
assert(searchKnowledge("nonexistent-xyz").length === 0, '"nonexistent-xyz" returns 0 (no false positives)');
assert(searchKnowledge("twitter").length >= 1, '"twitter" finds twitter file');
assert(searchKnowledge("x").length >= 1, '"x" exact-matches twitter (keyword "x")');

console.log("\n=== 8. Static site files ===");
const siteFiles = [
  "index.html",
  "blog/index.html",
  "blog/what-is-context-engineering.html",
  "blog/claude-desktop-mcp-setup.html",
  "blog/context-engineering-vs-prompt-engineering.html",
  "packs/index.html",
  "robots.txt",
  "sitemap.xml",
  "vercel.json",
  "LICENSE",
];
for (const f of siteFiles) {
  assert(fs.existsSync(path.join(ROOT_DIR, f)), `${f} exists`);
}

// Validate HTML files have doctype
for (const f of siteFiles.filter((f) => f.endsWith(".html"))) {
  const content = fs.readFileSync(path.join(ROOT_DIR, f), "utf-8");
  assert(content.trim().startsWith("<!DOCTYPE html>"), `${f} has DOCTYPE`);
}

console.log("\n=== 9. SEO infrastructure ===");
const indexHtml = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf-8");
assert(indexHtml.includes('rel="canonical"'), "index.html has canonical URL");
assert(indexHtml.includes('og:title'), "index.html has Open Graph title");
assert(indexHtml.includes('twitter:card'), "index.html has Twitter Card");
assert(indexHtml.includes('application/ld+json'), "index.html has JSON-LD structured data");
assert(indexHtml.includes('Kuleana808/Know-Help'), "index.html has correct GitHub URL");

const sitemap = fs.readFileSync(path.join(ROOT_DIR, "sitemap.xml"), "utf-8");
assert(sitemap.includes("know.help"), "sitemap.xml references know.help domain");

const robots = fs.readFileSync(path.join(ROOT_DIR, "robots.txt"), "utf-8");
assert(robots.includes("sitemap.xml"), "robots.txt references sitemap");

console.log("\n=== 10. Package.json completeness ===");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
assert(pkg.mcpName === "io.github.kuleana808/know-help", "package.json has mcpName for MCP registry");
assert(pkg.repository && pkg.repository.url, "package.json has repository URL");
assert(pkg.license === "MIT", "package.json has MIT license");
assert(pkg.keywords && pkg.keywords.includes("mcp"), "package.json has MCP keyword");
assert(pkg.bin && pkg.bin["know-help"], "package.json has bin entry");

// ── Summary ───────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
