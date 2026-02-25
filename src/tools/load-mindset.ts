import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import {
  MINDSETS_DIR,
  resolveMindsetFilePath,
  walkMindsetDir,
} from "../mindsets/paths";
import { KNOWLEDGE_DIR } from "../utils/paths";
import { appendJsonl } from "../utils/jsonl";

/**
 * Register the load_mindset MCP tool.
 * Loads a creator's full Mindset or a specific topic within it.
 */
export function registerLoadMindset(server: McpServer): void {
  server.tool(
    "load_mindset",
    "Load files from an installed Mindset. If topic is provided, loads matching files only. Otherwise loads MINDSET.md + core/ files. Path-traversal protected.",
    {
      creator_slug: z.string().describe("The creator's slug (directory name under mindsets/)"),
      topic: z.string().optional().describe("Optional topic to filter — loads files matching this keyword"),
    },
    async ({ creator_slug, topic }) => {
      const mindsetBase = path.join(MINDSETS_DIR, creator_slug);

      if (!fs.existsSync(mindsetBase)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Mindset not found: ${creator_slug}`,
                suggestion: "Use list_knowledge or search_mindset to see available Mindsets",
              }),
            },
          ],
        };
      }

      const loaded: Array<{ filepath: string; content: string; load_for: string }> = [];

      if (topic) {
        // Load files matching the topic
        const allFiles = walkMindsetDir(mindsetBase);
        const topicLower = topic.toLowerCase();

        for (const relPath of allFiles) {
          const fullPath = resolveMindsetFilePath(creator_slug, relPath);
          if (!fullPath || !fs.existsSync(fullPath)) continue;

          const ext = path.extname(relPath).toLowerCase();
          if (ext !== ".md") continue;

          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const loadForMatch = content.match(/Load for:\s*(.+)/);
            const loadFor = loadForMatch ? loadForMatch[1].trim() : "";

            // Match topic against Load for: keywords, filepath, or content
            const matches =
              loadFor.toLowerCase().includes(topicLower) ||
              relPath.toLowerCase().includes(topicLower);

            if (matches) {
              loaded.push({
                filepath: `mindsets/${creator_slug}/${relPath}`,
                content,
                load_for: loadFor,
              });
            }
          } catch {
            // Skip unreadable files
          }

          // Cap at 2 files unless explicitly asking for more
          if (loaded.length >= 2) break;
        }
      } else {
        // Load MINDSET.md + core/ files
        const manifestPath = path.join(mindsetBase, "MINDSET.md");
        if (fs.existsSync(manifestPath)) {
          loaded.push({
            filepath: `mindsets/${creator_slug}/MINDSET.md`,
            content: fs.readFileSync(manifestPath, "utf-8"),
            load_for: "mindset manifest",
          });
        }

        // Load core/ directory files
        const coreDir = path.join(mindsetBase, "core");
        if (fs.existsSync(coreDir)) {
          const coreFiles = walkMindsetDir(coreDir);
          for (const relPath of coreFiles) {
            const fullPath = path.join(coreDir, relPath);
            if (!fs.existsSync(fullPath)) continue;

            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const loadForMatch = content.match(/Load for:\s*(.+)/);
              loaded.push({
                filepath: `mindsets/${creator_slug}/core/${relPath}`,
                content,
                load_for: loadForMatch ? loadForMatch[1].trim() : "",
              });
            } catch {
              // Skip
            }
          }
        }
      }

      // Log access to activity.jsonl
      try {
        const logDir = path.join(KNOWLEDGE_DIR, "log");
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const activityFile = path.join(logDir, "activity.jsonl");
        appendJsonl(activityFile, {
          date: new Date().toISOString(),
          action: "load_mindset",
          creator: creator_slug,
          topic: topic || "full",
          files_loaded: loaded.length,
        });
      } catch {
        // Non-fatal
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              creator: creator_slug,
              topic: topic || null,
              files_loaded: loaded.length,
              files: loaded.map((f) => ({
                filepath: f.filepath,
                load_for: f.load_for,
                content: f.content,
              })),
            }),
          },
        ],
      };
    }
  );
}
