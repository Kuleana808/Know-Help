import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import {
  MINDSETS_DIR,
  walkMindsetDir,
  parseMindsetManifest,
} from "../mindsets/paths";

interface SearchResult {
  filepath: string;
  mindset_id: string;
  creator: string;
  load_for: string;
  relevance_score: number;
}

/**
 * Register the search_mindset MCP tool.
 * Scans all installed Mindset trigger headers and CLAUDE.md routing index.
 * Returns top 5 matches by relevance score.
 */
export function registerSearchMindset(server: McpServer): void {
  server.tool(
    "search_mindset",
    "Search installed Mindsets for relevant context by matching query against trigger keywords. Returns the best matching files across all installed Mindsets.",
    { query: z.string().describe("Search query — keywords that match Mindset triggers") },
    async ({ query }) => {
      const results: SearchResult[] = [];

      if (!fs.existsSync(MINDSETS_DIR)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ results: [], message: "No Mindsets installed" }),
            },
          ],
        };
      }

      // Tokenize query
      const queryTokens = query
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((t) => t.length > 1);

      if (queryTokens.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ results: [], message: "Empty query" }),
            },
          ],
        };
      }

      // Scan each installed Mindset
      const mindsetDirs = fs.readdirSync(MINDSETS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const creatorSlug of mindsetDirs) {
        const mindsetPath = path.join(MINDSETS_DIR, creatorSlug);
        const manifestPath = path.join(mindsetPath, "MINDSET.md");

        // Read manifest for triggers
        let manifestTriggers: string[] = [];
        let mindsetId = creatorSlug;
        let mindsetCreator = creatorSlug;

        if (fs.existsSync(manifestPath)) {
          const content = fs.readFileSync(manifestPath, "utf-8");
          const manifest = parseMindsetManifest(content);
          if (manifest) {
            manifestTriggers = (manifest.triggers || []).map((t: string) =>
              t.toLowerCase()
            );
            mindsetId = manifest.id || creatorSlug;
            mindsetCreator = manifest.creator || creatorSlug;
          }
        }

        // Score manifest-level trigger match
        const manifestScore = queryTokens.reduce((score, token) => {
          return score + (manifestTriggers.some((t) => t.includes(token)) ? 2 : 0);
        }, 0);

        // Scan individual files
        const allFiles = walkMindsetDir(mindsetPath);
        for (const relPath of allFiles) {
          if (relPath === "MINDSET.md") continue;

          const fullPath = path.join(mindsetPath, relPath);
          const ext = path.extname(relPath).toLowerCase();

          if (ext !== ".md") continue;

          try {
            const content = fs.readFileSync(fullPath, "utf-8");

            // Extract "Load for:" header
            const loadForMatch = content.match(/Load for:\s*(.+)/);
            const loadFor = loadForMatch ? loadForMatch[1].trim() : "";

            // Score based on Load for: keywords
            const loadForTokens = loadFor.toLowerCase().split(/[\s,]+/).filter(Boolean);
            let fileScore = manifestScore; // inherit manifest-level boost

            for (const token of queryTokens) {
              // Match in Load for: field
              if (loadForTokens.some((lt) => lt.includes(token))) {
                fileScore += 3;
              }
              // Match in filename
              if (relPath.toLowerCase().includes(token)) {
                fileScore += 1;
              }
            }

            if (fileScore > 0) {
              results.push({
                filepath: `mindsets/${creatorSlug}/${relPath}`,
                mindset_id: mindsetId,
                creator: mindsetCreator,
                load_for: loadFor,
                relevance_score: fileScore,
              });
            }
          } catch {
            // Skip unreadable files
          }
        }
      }

      // Sort by score descending and take top 5
      results.sort((a, b) => b.relevance_score - a.relevance_score);
      const top = results.slice(0, 5);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ results: top, total_scanned: results.length }),
          },
        ],
      };
    }
  );
}
