import { z } from "zod/v3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as path from "path";
import { ensureKnowledgeDir, KNOWLEDGE_DIR } from "../utils/paths";
import { appendJsonl } from "../utils/jsonl";

export function registerAppendDecision(server: McpServer): void {
  server.tool(
    "append_decision",
    "Append a decision entry to the decisions log. Records decision, reasoning, and alternatives considered. Append only.",
    {
      venture: z
        .string()
        .describe("Which venture or project this decision relates to"),
      decision: z.string().describe("What was decided"),
      reasoning: z.string().describe("Why this decision was made"),
      alternatives: z
        .string()
        .describe("What alternatives were considered"),
    },
    async ({ venture, decision, reasoning, alternatives }) => {
      ensureKnowledgeDir();
      const filePath = path.join(
        KNOWLEDGE_DIR,
        "log",
        "decisions.jsonl"
      );

      appendJsonl(
        filePath,
        {
          date: new Date().toISOString(),
          venture,
          decision,
          reasoning,
          alternatives,
          outcome: "pending",
        },
        {
          _schema: "decision",
          _version: "1.0",
          _description:
            "Append-only log of key decisions with reasoning",
        }
      );

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
}
