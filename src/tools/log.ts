import { z } from "zod/v3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "fs";
import * as path from "path";
import { ensureKnowledgeDir, KNOWLEDGE_DIR } from "../utils/paths";
import { writeClaudeMd } from "../utils/triggers";

export function registerLogActivity(server: McpServer): void {
  server.tool(
    "log_activity",
    "Append a timestamped activity entry to today's log file at knowledge/log/YYYY-MM-DD.md. Format: [HH:MM HST] entry",
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
      const logLine = `- [${timeStr} HST] ${entry}\n`;

      if (!fs.existsSync(logFile)) {
        const header = `---\nLoad for: log, activity, ${dateStr}\nLast updated: ${dateStr}\n---\n\n# Activity Log — ${dateStr}\n\n`;
        fs.writeFileSync(logFile, header + logLine, "utf-8");
      } else {
        fs.appendFileSync(logFile, logLine, "utf-8");
      }

      writeClaudeMd();

      return {
        content: [
          {
            type: "text" as const,
            text: `Logged: [${timeStr} HST] ${entry}`,
          },
        ],
      };
    }
  );
}
