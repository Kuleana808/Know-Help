import { z } from "zod/v3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as path from "path";
import { ensureKnowledgeDir, KNOWLEDGE_DIR } from "../utils/paths";
import { appendJsonl } from "../utils/jsonl";

export function registerAppendFailure(server: McpServer): void {
  server.tool(
    "append_failure",
    "Append a failure entry to the failures log. Records what happened, root cause, and prevention steps. Append only.",
    {
      venture: z
        .string()
        .describe("Which venture or project this failure relates to"),
      what: z.string().describe("What failed"),
      root_cause: z.string().describe("Root cause analysis"),
      prevention: z
        .string()
        .describe("How to prevent this in the future"),
    },
    async ({ venture, what, root_cause, prevention }) => {
      ensureKnowledgeDir();
      const filePath = path.join(
        KNOWLEDGE_DIR,
        "log",
        "failures.jsonl"
      );

      appendJsonl(
        filePath,
        {
          date: new Date().toISOString(),
          venture,
          what,
          root_cause,
          prevention,
        },
        {
          _schema: "failure",
          _version: "1.0",
          _description:
            "Append-only log of failures with root cause analysis",
        }
      );

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
}
