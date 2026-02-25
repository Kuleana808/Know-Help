import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import {
  MINDSETS_DIR,
  SYNC_FILE,
  CONFIG_FILE,
  parseMindsetManifest,
} from "../mindsets/paths";
import {
  getInstalledMindsets,
  updateMindsetVersion,
  logSyncEvent,
} from "../mindsets/cache";

const API_URL = process.env.KNOW_HELP_API_URL || "https://know.help/api";

/**
 * Register the sync_mindsets MCP tool.
 * Checks know.help API for updates to all installed Mindsets.
 */
export function registerSyncMindsets(server: McpServer): void {
  server.tool(
    "sync_mindsets",
    "Sync all installed Mindsets with the know.help server. Downloads updates for active subscriptions.",
    {},
    async () => {
      const updated: string[] = [];
      const current: string[] = [];
      const failed: string[] = [];

      // Read API token from config
      let token = process.env.KNOW_HELP_TOKEN || "";
      if (!token && fs.existsSync(CONFIG_FILE)) {
        try {
          const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
          token = config.token || "";
        } catch {
          // Use env var
        }
      }

      const installed = getInstalledMindsets();

      if (installed.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: "No Mindsets installed",
                updated: [],
                current: [],
                failed: [],
              }),
            },
          ],
        };
      }

      for (const mindset of installed) {
        try {
          // Check remote version
          const versionRes = await fetch(
            `${API_URL}/mindsets/sync/${mindset.creator_slug}/version`
          );

          if (!versionRes.ok) {
            failed.push(`${mindset.creator_slug}: API error ${versionRes.status}`);
            continue;
          }

          const versionData = (await versionRes.json()) as {
            version: string;
            updated: string;
          };

          if (versionData.version === mindset.version) {
            current.push(mindset.creator_slug);
            continue;
          }

          // Version is different — download updated files
          const filesRes = await fetch(
            `${API_URL}/mindsets/sync/${mindset.creator_slug}/files`,
            {
              headers: {
                Authorization: `Bearer ${mindset.install_token || token}`,
              },
            }
          );

          if (!filesRes.ok) {
            failed.push(`${mindset.creator_slug}: download error ${filesRes.status}`);
            continue;
          }

          const filesData = (await filesRes.json()) as {
            manifest: string;
            files: Record<string, { content: string; hash: string; load_for: string }>;
            mindset: { version: string };
          };

          // Write updated files locally
          const mindsetDir = path.join(MINDSETS_DIR, mindset.creator_slug);
          if (!fs.existsSync(mindsetDir)) {
            fs.mkdirSync(mindsetDir, { recursive: true });
          }

          // Write MINDSET.md
          fs.writeFileSync(path.join(mindsetDir, "MINDSET.md"), filesData.manifest, "utf-8");

          // Write all files
          const changedFiles: string[] = [];
          for (const [fp, data] of Object.entries(filesData.files)) {
            const fullPath = path.join(mindsetDir, fp);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, data.content, "utf-8");
            changedFiles.push(fp);
          }

          // Update local cache
          updateMindsetVersion(
            mindset.creator_slug,
            filesData.mindset.version,
            Object.keys(filesData.files).length
          );

          logSyncEvent(
            mindset.id,
            "sync",
            mindset.version,
            filesData.mindset.version,
            changedFiles
          );

          updated.push(mindset.creator_slug);
        } catch (err: any) {
          failed.push(`${mindset.creator_slug}: ${err.message}`);
        }
      }

      // Write sync timestamp
      fs.writeFileSync(SYNC_FILE, new Date().toISOString(), "utf-8");

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ updated, current, failed }),
          },
        ],
      };
    }
  );
}
