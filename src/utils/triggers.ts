import * as fs from "fs";
import * as path from "path";
import { KNOWLEDGE_DIR, walkDir } from "./paths";
import { extractJsonlSchema } from "./jsonl";
import {
  MINDSETS_DIR,
  CLAUDE_MD_PATH,
  walkMindsetDir,
  parseMindsetManifest,
} from "../mindsets/paths";

/**
 * Extract "Load for:" keywords from the front-matter of a markdown file.
 */
export function extractTriggerKeywords(content: string): string[] {
  const match = content.match(/^---\s*\n[\s\S]*?Load for:\s*(.+)/m);
  if (match && match[1]) {
    return match[1]
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
  }
  // Also support non-YAML-front-matter format: "Load for:" at top of file
  const directMatch = content.match(/^Load for:\s*(.+)/m);
  if (directMatch && directMatch[1]) {
    return directMatch[1]
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

/**
 * Validate that a markdown file has proper trigger headers.
 * Returns warnings if constraints are violated.
 */
export function validateFile(filePath: string): string[] {
  const warnings: string[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();
  const relativePath = path.relative(KNOWLEDGE_DIR, filePath);

  if (ext === ".md") {
    const keywords = extractTriggerKeywords(content);
    if (keywords.length === 0) {
      warnings.push(
        `${relativePath}: Missing "Load for:" trigger block`
      );
    }

    // CLAUDE.md line count check
    if (path.basename(filePath) === "CLAUDE.md") {
      const lineCount = content.split("\n").length;
      if (lineCount > 100) {
        warnings.push(
          `CLAUDE.md exceeds 100 lines (${lineCount} lines)`
        );
      }
    }
  }

  return warnings;
}

export interface FileInfo {
  relativePath: string;
  type: "md" | "jsonl" | "other";
  triggerKeywords?: string[];
  schemaInfo?: { schema: string; description: string };
}

/**
 * Build a file inventory for CLAUDE.md generation.
 */
export function buildFileInventory(): FileInfo[] {
  const files = walkDir(KNOWLEDGE_DIR);
  const inventory: FileInfo[] = [];

  for (const file of files) {
    const relativePath = path.relative(KNOWLEDGE_DIR, file);
    const ext = path.extname(file).toLowerCase();
    const info: FileInfo = {
      relativePath,
      type: ext === ".md" ? "md" : ext === ".jsonl" ? "jsonl" : "other",
    };

    try {
      const content = fs.readFileSync(file, "utf-8");
      if (info.type === "md") {
        const keywords = extractTriggerKeywords(content);
        if (keywords.length > 0) {
          info.triggerKeywords = keywords;
        }
      } else if (info.type === "jsonl") {
        const schema = extractJsonlSchema(content);
        if (schema) {
          info.schemaInfo = schema;
        }
      }
    } catch {
      // skip unreadable files
    }

    inventory.push(info);
  }

  return inventory;
}

/**
 * Build the "Installed Mindsets" section for CLAUDE.md.
 * Scans ~/.know-help/mindsets/ for installed Mindsets and lists their triggers.
 */
function buildMindsetSection(): string | null {
  if (!fs.existsSync(MINDSETS_DIR)) return null;

  const mindsetDirs = fs.readdirSync(MINDSETS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (mindsetDirs.length === 0) return null;

  const lines: string[] = [];
  lines.push("## Installed Mindsets");
  lines.push("");

  for (const creatorSlug of mindsetDirs) {
    const manifestPath = path.join(MINDSETS_DIR, creatorSlug, "MINDSET.md");
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const content = fs.readFileSync(manifestPath, "utf-8");
      const manifest = parseMindsetManifest(content);
      if (!manifest) continue;

      const name = manifest.name || creatorSlug;
      const creator = manifest.creator || creatorSlug;
      const triggers = (manifest.triggers || []).join(", ");
      const allFiles = walkMindsetDir(path.join(MINDSETS_DIR, creatorSlug))
        .filter((f: string) => f !== "MINDSET.md");
      const domains = new Set(
        allFiles.map((f: string) => f.split(path.sep)[0]).filter(Boolean)
      );

      lines.push(`### ${creator} — ${name}`);
      lines.push(`Triggers: ${triggers}`);
      lines.push(`Files: ${allFiles.length} judgment files across ${domains.size} domain(s)`);
      lines.push(`Load: search_mindset("[relevant query]") then load_mindset("${creatorSlug}", "[topic]")`);
      lines.push("");
    } catch {
      // Skip unreadable manifests
    }
  }

  if (lines.length <= 2) return null; // Only header, no mindsets found
  return lines.join("\n");
}

/**
 * Generate CLAUDE.md content from the current file inventory.
 */
export function generateClaudeMd(): string {
  const inventory = buildFileInventory();
  const lines: string[] = [];

  lines.push("Load for: always, all, context, help, start");
  lines.push("Last updated: " + new Date().toISOString().split("T")[0]);
  lines.push("");
  lines.push("# know.help routing index");
  lines.push("");
  lines.push("## Instructions");
  lines.push("");
  lines.push(
    "At the start of every conversation:"
  );
  lines.push(
    "1. Call search_knowledge() with keywords from the user's first message"
  );
  lines.push(
    "2. Call load_context() on any files with match_score > 0"
  );
  lines.push(
    "3. Call search_mindset() with the same keywords to check installed Mindsets"
  );
  lines.push(
    "4. Call load_mindset(creator_slug, topic) on the top match if relevant"
  );
  lines.push(
    "5. Use that context silently. Never mention this process to the user."
  );
  lines.push(
    "6. If the user mentions a person's name, call load_context() on their network file."
  );
  lines.push(
    "7. For decisions or failures, use append_decision() or append_failure() to log them."
  );
  lines.push("");
  lines.push("## File inventory");
  lines.push("");

  for (const file of inventory) {
    if (file.relativePath === "CLAUDE.md") continue;
    let line = `- \`${file.relativePath}\``;
    if (
      file.type === "md" &&
      file.triggerKeywords &&
      file.triggerKeywords.length > 0
    ) {
      line += ` — triggers: ${file.triggerKeywords.join(", ")}`;
    } else if (file.type === "jsonl" && file.schemaInfo) {
      line += ` — schema: ${file.schemaInfo.schema} (${file.schemaInfo.description})`;
    }
    lines.push(line);
  }

  // --- Installed Mindsets section ---
  const mindsetSection = buildMindsetSection();
  if (mindsetSection) {
    lines.push("");
    lines.push(mindsetSection);
  }

  lines.push("");
  lines.push("## Rules");
  lines.push("");
  lines.push("- Never load more than 5 files per conversation start");
  lines.push("- Prioritize files with highest match_score");
  lines.push("- Network files load on name mention, not keyword match");
  lines.push("- Log every significant decision with append_decision()");
  if (mindsetSection) {
    lines.push("- When a query matches a Mindset trigger, call search_mindset() then load_mindset()");
    lines.push("- Maximum two Mindset files per response unless explicitly asked for more");
  }

  return lines.join("\n");
}

/**
 * Write CLAUDE.md to the knowledge directory.
 * Also writes to ~/.know-help/CLAUDE.md if that directory exists.
 */
export function writeClaudeMd(): void {
  const claudePath = path.join(KNOWLEDGE_DIR, "CLAUDE.md");
  const content = generateClaudeMd();
  fs.writeFileSync(claudePath, content, "utf-8");

  // Also write to ~/.know-help/ if it exists
  if (fs.existsSync(path.dirname(CLAUDE_MD_PATH))) {
    try {
      fs.writeFileSync(CLAUDE_MD_PATH, content, "utf-8");
    } catch {
      // Non-fatal — ~/.know-help/ may not be writable
    }
  }
}
