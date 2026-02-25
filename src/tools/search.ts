import { z } from "zod/v3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureKnowledgeDir } from "../utils/paths";
import { buildFileInventory } from "../utils/triggers";

export function registerSearchKnowledge(server: McpServer): void {
  server.tool(
    "search_knowledge",
    "Scan trigger keywords in all knowledge files. Returns matching file paths sorted by relevance score. Use at conversation start to find relevant context.",
    {
      query: z
        .string()
        .describe("Search query — keywords to match against file triggers"),
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

      matches.sort((a, b) => b.score - a.score);

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                results: [],
                message:
                  "No matches found. Try list_knowledge() to browse available context.",
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              results: matches.map((m) => ({
                path: m.path,
                triggers: m.keywords || [],
                match_score: m.score,
              })),
            }),
          },
        ],
      };
    }
  );
}
