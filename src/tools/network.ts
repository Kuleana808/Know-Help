import { z } from "zod/v3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as path from "path";
import { ensureKnowledgeDir, slugify, KNOWLEDGE_DIR } from "../utils/paths";
import { appendJsonl } from "../utils/jsonl";
import { writeClaudeMd } from "../utils/triggers";

export function registerUpdateNetwork(server: McpServer): void {
  server.tool(
    "update_network",
    "Append a JSONL entry for a person in the network. Creates the file with schema declaration if new. Never overwrites existing lines.",
    {
      name: z.string().describe("Person's name"),
      notes: z
        .string()
        .describe("Notes about this interaction or update"),
    },
    async ({ name, notes }) => {
      ensureKnowledgeDir();
      const slug = slugify(name);
      const filePath = path.join(
        KNOWLEDGE_DIR,
        "network",
        `${slug}.jsonl`
      );

      appendJsonl(
        filePath,
        {
          date: new Date().toISOString(),
          name,
          notes,
        },
        {
          _schema: "contact",
          _version: "1.0",
          _description: `Interaction log for ${name}`,
        }
      );

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
}
