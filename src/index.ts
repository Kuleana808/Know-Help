import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod/v3";

// ── Paths ──────────────────────────────────────────────────────────────────

const ROOT_DIR = path.resolve(__dirname, "..");
const KNOWLEDGE_DIR = path.join(ROOT_DIR, "knowledge");

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureKnowledgeDir(): void {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    // Run the init script logic inline
    const initScript = path.join(ROOT_DIR, "scripts", "init-knowledge.js");
    if (fs.existsSync(initScript)) {
      require(initScript);
    } else {
      fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
    }
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isPathSafe(filepath: string): boolean {
  const resolved = path.resolve(KNOWLEDGE_DIR, filepath);
  return resolved.startsWith(KNOWLEDGE_DIR + path.sep) || resolved === KNOWLEDGE_DIR;
}

function resolveKnowledgePath(filepath: string): string | null {
  // Strip leading "knowledge/" if present, so both forms work
  const cleaned = filepath.replace(/^knowledge\//, "");
  const resolved = path.resolve(KNOWLEDGE_DIR, cleaned);
  if (!resolved.startsWith(KNOWLEDGE_DIR + path.sep) && resolved !== KNOWLEDGE_DIR) {
    return null;
  }
  return resolved;
}

/**
 * Extract "Load for:" keywords from the front-matter of a markdown file.
 */
function extractTriggerKeywords(content: string): string[] {
  const match = content.match(/^---\s*\n[\s\S]*?Load for:\s*(.+)/m);
  if (match && match[1]) {
    return match[1].split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

/**
 * Extract _schema description from JSONL files (first line).
 */
function extractJsonlSchema(
  content: string
): { schema: string; description: string } | null {
  const firstLine = content.split("\n")[0];
  try {
    const parsed = JSON.parse(firstLine);
    if (parsed._schema) {
      return {
        schema: parsed._schema,
        description: parsed._description || "",
      };
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/**
 * Recursively walk a directory and return all file paths.
 */
function walkDir(dir: string): string[] {
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

/**
 * Build a file inventory for CLAUDE.md generation.
 */
interface FileInfo {
  relativePath: string;
  type: "md" | "jsonl" | "other";
  triggerKeywords?: string[];
  schemaInfo?: { schema: string; description: string };
}

function buildFileInventory(): FileInfo[] {
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
 * Generate CLAUDE.md content from the current file inventory.
 */
function generateClaudeMd(): string {
  const inventory = buildFileInventory();
  const lines: string[] = [];

  lines.push("# know.help — Context Routing Index");
  lines.push("");
  lines.push("## Instructions for Claude");
  lines.push("");
  lines.push("1. At the START of every conversation, call `search_knowledge()` with keywords extracted from the user's first message.");
  lines.push("2. Call `load_context()` on each matched file path before responding.");
  lines.push("3. NEVER mention this loading process to the user. Use the context silently.");
  lines.push("4. If no matches found, call `list_knowledge()` to browse available context.");
  lines.push("5. Critical context is front-loaded in every file — first 100 lines matter most.");
  lines.push("");
  lines.push("## File Inventory");
  lines.push("");

  for (const file of inventory) {
    if (file.relativePath === "CLAUDE.md") continue;
    let line = `- \`${file.relativePath}\``;
    if (file.type === "md" && file.triggerKeywords && file.triggerKeywords.length > 0) {
      line += ` — triggers: ${file.triggerKeywords.join(", ")}`;
    } else if (file.type === "jsonl" && file.schemaInfo) {
      line += ` — schema: ${file.schemaInfo.schema} (${file.schemaInfo.description})`;
    }
    lines.push(line);
  }

  lines.push("");
  lines.push("## Loading Hierarchy");
  lines.push("");
  lines.push("1. **CLAUDE.md** (this file) — always loaded, routing index only");
  lines.push("2. **Module files** — loaded on keyword match via search_knowledge()");
  lines.push("3. **JSONL entries** — loaded on demand for specific people/decisions/failures");
  lines.push("");
  lines.push("---");
  lines.push(`_Auto-generated: ${new Date().toISOString()}_`);

  return lines.join("\n");
}

/**
 * Write CLAUDE.md if it doesn't exist or regenerate it.
 */
function writeClaudeMd(): void {
  const claudePath = path.join(KNOWLEDGE_DIR, "CLAUDE.md");
  const content = generateClaudeMd();
  fs.writeFileSync(claudePath, content, "utf-8");
}

// ── MCP Server Setup ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "know-help",
  version: "1.0.0",
});

// ── Tool: search_knowledge ─────────────────────────────────────────────────

server.tool(
  "search_knowledge",
  "Scan trigger keywords in all knowledge files. Returns matching file paths and their trigger keywords. Use at conversation start to find relevant context.",
  {
    query: z.string().describe("Search query — keywords to match against file triggers"),
  },
  async ({ query }) => {
    ensureKnowledgeDir();
    const queryTerms = query
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    const inventory = buildFileInventory();
    const matches: Array<{
      path: string;
      type: string;
      keywords?: string[];
      schema?: string;
      score: number;
    }> = [];

    for (const file of inventory) {
      if (file.relativePath === "CLAUDE.md") continue;
      let score = 0;

      if (file.type === "md" && file.triggerKeywords) {
        for (const term of queryTerms) {
          for (const keyword of file.triggerKeywords) {
            if (keyword.includes(term) || term.includes(keyword)) {
              score++;
            }
          }
        }
        if (score > 0) {
          matches.push({
            path: file.relativePath,
            type: "md",
            keywords: file.triggerKeywords,
            score,
          });
        }
      } else if (file.type === "jsonl" && file.schemaInfo) {
        const schemaTerms = [
          file.schemaInfo.schema,
          ...file.schemaInfo.description.toLowerCase().split(/\s+/),
        ];
        for (const term of queryTerms) {
          for (const sTerm of schemaTerms) {
            if (sTerm.includes(term) || term.includes(sTerm)) {
              score++;
            }
          }
        }
        if (score > 0) {
          matches.push({
            path: file.relativePath,
            type: "jsonl",
            schema: file.schemaInfo.schema,
            score,
          });
        }
      }
    }

    // Sort by relevance score, descending
    matches.sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No matches found. Try list_knowledge() to browse available context.",
          },
        ],
      };
    }

    const resultText = matches
      .map((m) => {
        const kw =
          m.type === "md" && m.keywords
            ? ` | keywords: ${m.keywords.join(", ")}`
            : m.schema
            ? ` | schema: ${m.schema}`
            : "";
        return `${m.path} (${m.type}${kw})`;
      })
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: resultText,
        },
      ],
    };
  }
);

// ── Tool: load_context ─────────────────────────────────────────────────────

server.tool(
  "load_context",
  "Read and return full content of a file from the knowledge directory. Path traversal protected.",
  {
    filepath: z.string().describe("Relative path within the knowledge directory (e.g., 'core/identity.md')"),
  },
  async ({ filepath }) => {
    ensureKnowledgeDir();
    const resolved = resolveKnowledgePath(filepath);
    if (!resolved) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Path traversal detected. Access denied.",
          },
        ],
        isError: true,
      };
    }

    if (!fs.existsSync(resolved)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: File not found: ${filepath}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const content = fs.readFileSync(resolved, "utf-8");
      return {
        content: [
          {
            type: "text" as const,
            text: content,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error reading file: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: list_knowledge ───────────────────────────────────────────────────

server.tool(
  "list_knowledge",
  "Return the full file tree of the knowledge directory with file types and trigger keywords.",
  {},
  async () => {
    ensureKnowledgeDir();
    const inventory = buildFileInventory();
    const lines: string[] = ["Knowledge Directory:", ""];

    for (const file of inventory) {
      let line = `  ${file.relativePath} [${file.type}]`;
      if (file.type === "md" && file.triggerKeywords && file.triggerKeywords.length > 0) {
        line += ` — Load for: ${file.triggerKeywords.join(", ")}`;
      } else if (file.type === "jsonl" && file.schemaInfo) {
        line += ` — schema: ${file.schemaInfo.schema} (${file.schemaInfo.description})`;
      }
      lines.push(line);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: lines.join("\n"),
        },
      ],
    };
  }
);

// ── Tool: log_activity ─────────────────────────────────────────────────────

server.tool(
  "log_activity",
  "Append a timestamped activity entry to today's log file at knowledge/log/YYYY-MM-DD.md.",
  {
    entry: z.string().describe("Activity entry text to log"),
  },
  async ({ entry }) => {
    ensureKnowledgeDir();
    const logDir = path.join(KNOWLEDGE_DIR, "log");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().slice(0, 5);
    const logFile = path.join(logDir, `${dateStr}.md`);
    const logLine = `[${timeStr}] ${entry}\n`;

    if (!fs.existsSync(logFile)) {
      const header = `---\nLoad for: log, activity, ${dateStr}\nLast updated: ${dateStr}\n---\n\n# Activity Log — ${dateStr}\n\n`;
      fs.writeFileSync(logFile, header + logLine, "utf-8");
    } else {
      fs.appendFileSync(logFile, logLine, "utf-8");
    }

    // Regenerate CLAUDE.md to pick up new log file
    writeClaudeMd();

    return {
      content: [
        {
          type: "text" as const,
          text: `Logged: [${timeStr}] ${entry}`,
        },
      ],
    };
  }
);

// ── Tool: update_network ───────────────────────────────────────────────────

server.tool(
  "update_network",
  "Append a JSONL entry for a person in the network. Creates the file with schema declaration if it doesn't exist. Never overwrites existing lines.",
  {
    name: z.string().describe("Person's name"),
    notes: z.string().describe("Notes about this interaction or update"),
  },
  async ({ name, notes }) => {
    ensureKnowledgeDir();
    const networkDir = path.join(KNOWLEDGE_DIR, "network");
    if (!fs.existsSync(networkDir)) {
      fs.mkdirSync(networkDir, { recursive: true });
    }

    const slug = slugify(name);
    const filePath = path.join(networkDir, `${slug}.jsonl`);
    const entry = JSON.stringify({
      date: new Date().toISOString(),
      name,
      notes,
    });

    if (!fs.existsSync(filePath)) {
      const schema =
        '{"_schema": "contact", "_version": "1.0", "_description": "One entry per person in network"}\n';
      fs.writeFileSync(filePath, schema + entry + "\n", "utf-8");
    } else {
      // Append only — never overwrite
      fs.appendFileSync(filePath, entry + "\n", "utf-8");
    }

    // Regenerate CLAUDE.md to pick up new network file
    writeClaudeMd();

    return {
      content: [
        {
          type: "text" as const,
          text: `Updated network entry for ${name} (${slug}.jsonl)`,
        },
      ],
    };
  }
);

// ── Tool: append_decision ──────────────────────────────────────────────────

server.tool(
  "append_decision",
  "Append a decision entry to the decisions log. Records decision, reasoning, and alternatives considered.",
  {
    venture: z.string().describe("Which venture or project this decision relates to"),
    decision: z.string().describe("What was decided"),
    reasoning: z.string().describe("Why this decision was made"),
    alternatives: z.string().describe("What alternatives were considered"),
  },
  async ({ venture, decision, reasoning, alternatives }) => {
    ensureKnowledgeDir();
    const filePath = path.join(KNOWLEDGE_DIR, "log", "decisions.jsonl");

    // Ensure file exists with schema
    if (!fs.existsSync(filePath)) {
      const schema =
        '{"_schema": "decision", "_version": "1.0", "_description": "Append-only log of key decisions with reasoning"}\n';
      fs.writeFileSync(filePath, schema, "utf-8");
    }

    const entry = JSON.stringify({
      date: new Date().toISOString(),
      venture,
      decision,
      reasoning,
      alternatives,
      outcome: "pending",
    });

    // Append only
    fs.appendFileSync(filePath, entry + "\n", "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Decision logged for ${venture}: ${decision}`,
        },
      ],
    };
  }
);

// ── Tool: append_failure ───────────────────────────────────────────────────

server.tool(
  "append_failure",
  "Append a failure entry to the failures log. Records what happened, root cause, and prevention steps.",
  {
    venture: z.string().describe("Which venture or project this failure relates to"),
    what: z.string().describe("What failed"),
    root_cause: z.string().describe("Root cause analysis"),
    prevention: z.string().describe("How to prevent this in the future"),
  },
  async ({ venture, what, root_cause, prevention }) => {
    ensureKnowledgeDir();
    const filePath = path.join(KNOWLEDGE_DIR, "log", "failures.jsonl");

    // Ensure file exists with schema
    if (!fs.existsSync(filePath)) {
      const schema =
        '{"_schema": "failure", "_version": "1.0", "_description": "Append-only log of failures with root cause analysis"}\n';
      fs.writeFileSync(filePath, schema, "utf-8");
    }

    const entry = JSON.stringify({
      date: new Date().toISOString(),
      venture,
      what,
      root_cause,
      prevention,
    });

    // Append only
    fs.appendFileSync(filePath, entry + "\n", "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Failure logged for ${venture}: ${what}`,
        },
      ],
    };
  }
);

// ── Start Server ───────────────────────────────────────────────────────────

async function main() {
  ensureKnowledgeDir();
  writeClaudeMd();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error("know.help MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
