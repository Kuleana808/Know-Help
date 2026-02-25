import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureKnowledgeDir } from "../utils/paths";
import { buildFileInventory } from "../utils/triggers";

export function registerListKnowledge(server: McpServer): void {
  server.tool(
    "list_knowledge",
    "Return the full file tree of the knowledge directory with file types, trigger keywords, and schema info as structured JSON.",
    {},
    async () => {
      ensureKnowledgeDir();
      const inventory = buildFileInventory();

      const files = inventory.map((file) => {
        const entry: Record<string, unknown> = {
          path: file.relativePath,
          type: file.type,
        };
        if (
          file.type === "md" &&
          file.triggerKeywords &&
          file.triggerKeywords.length > 0
        ) {
          entry.triggers = file.triggerKeywords;
        }
        if (file.type === "jsonl" && file.schemaInfo) {
          entry.schema = file.schemaInfo.schema;
          entry.description = file.schemaInfo.description;
        }
        return entry;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ files }, null, 2),
          },
        ],
      };
    }
  );
}
