import * as fs from "fs";
import { SYNC_FILE, CONFIG_FILE, MINDSETS_DIR } from "./paths";
import { getInstalledMindsets, getLastSyncTime } from "./cache";

const API_URL = process.env.KNOW_HELP_API_URL || "https://know.help/api";
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/**
 * Auto-sync Mindsets on MCP server startup.
 * 1. Run check_subscriptions()
 * 2. Run sync_mindsets() if last sync > 24 hours ago
 * 3. Write sync timestamp to ~/.know-help/.sync
 *
 * Non-blocking: errors are logged but don't prevent MCP startup.
 */
export async function autoSyncMindsets(): Promise<void> {
  try {
    const installed = getInstalledMindsets();
    if (installed.length === 0) return;

    // Read API token
    let token = process.env.KNOW_HELP_TOKEN || "";
    if (!token && fs.existsSync(CONFIG_FILE)) {
      try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
        token = config.token || "";
      } catch {
        // No config
      }
    }

    // If no token and no API URL, skip sync
    if (!token) {
      console.error("know.help: No API token configured, skipping auto-sync");
      return;
    }

    // Check if sync is needed (last sync > 24h ago)
    const lastSync = getLastSyncTime();
    const shouldSync =
      !lastSync || Date.now() - new Date(lastSync).getTime() > TWENTY_FOUR_HOURS;

    if (!shouldSync) {
      console.error("know.help: Last sync within 24h, skipping");
      return;
    }

    // 1. Check subscriptions
    const installTokens = installed.map((m) => m.install_token).filter(Boolean);
    if (installTokens.length > 0) {
      try {
        const res = await fetch(`${API_URL}/mindsets/subscriptions/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ install_tokens: installTokens }),
        });
        if (res.ok) {
          console.error("know.help: Subscription check complete");
        }
      } catch (err: any) {
        console.error(`know.help: Subscription check failed: ${err.message}`);
      }
    }

    // 2. Sync mindsets
    let syncCount = 0;
    for (const mindset of installed) {
      try {
        const versionRes = await fetch(
          `${API_URL}/mindsets/sync/${mindset.creator_slug}/version`
        );
        if (!versionRes.ok) continue;

        const versionData = (await versionRes.json()) as {
          version: string;
          updated: string;
        };

        if (versionData.version !== mindset.version) {
          syncCount++;
          console.error(`know.help: Update available for ${mindset.creator_slug} (${mindset.version} → ${versionData.version})`);
        }
      } catch {
        // Skip individual failures
      }
    }

    if (syncCount > 0) {
      console.error(`know.help: ${syncCount} Mindset(s) have updates. Run "know sync" to update.`);
    }

    // 3. Write sync timestamp
    fs.writeFileSync(SYNC_FILE, new Date().toISOString(), "utf-8");
  } catch (err: any) {
    console.error(`know.help: Auto-sync error: ${err.message}`);
  }
}
