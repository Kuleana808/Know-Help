import { z } from "zod/v3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "fs";
import * as path from "path";
import { ensureKnowledgeDir, resolveKnowledgePath } from "../utils/paths";

export function registerLoadContext(server: McpServer): void {
  server.tool(
    "load_context",
    "Read and return full content of a file from the knowledge directory. Path traversal protected.",
    {
      filepath: z
        .string()
        .describe(
          "Relative path within the knowledge directory (e.g., 'core/identity.md')"
        ),
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
        const ext = path.extname(resolved).toLowerCase();
        const fileType =
          ext === ".md" ? "md" : ext === ".jsonl" ? "jsonl" : "other";

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                content,
                filepath,
                type: fileType,
              }),
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
}
