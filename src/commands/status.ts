/**
 * know status — Show installed Mindsets and subscription status
 */

import * as fs from "fs";
import * as path from "path";
import { checkAuth } from "./auth";
import { getInstalledMindsets } from "../mindsets/cache";
import { KNOW_HELP_HOME } from "../mindsets/paths";

export async function statusCommand(): Promise<void> {
  const auth = await checkAuth();

  console.log("");
  console.log("know.help status");
  console.log("\u2500".repeat(45));

  // Auth state
  if (auth?.email) {
    console.log(`  Logged in as: ${auth.email}`);
  } else if (auth?.token) {
    console.log("  Logged in (token configured)");
  } else {
    console.log("  Not logged in");
  }

  // Installed Mindsets
  const installed = getInstalledMindsets();
  if (installed.length > 0) {
    console.log("");
    console.log(`  Installed Mindsets (${installed.length})`);
    for (const m of installed) {
      const status = m.subscription_status === "active" ? "\u2713 active" : `\u26A0 ${m.subscription_status}`;
      const synced = m.last_synced_at
        ? formatRelativeTime(m.last_synced_at)
        : "never";
      const nameStr = m.name
        ? `${m.creator_slug.padEnd(20)} ${m.name.padEnd(25)}`
        : m.creator_slug.padEnd(45);
      console.log(`    ${nameStr} v${m.version}   ${status}   synced ${synced}`);
    }
  } else {
    console.log("");
    console.log("  No Mindsets installed");
  }

  // User's own knowledge base
  const knowledgeDirs = ["core", "venture", "network", "platform", "planning"];
  const fileCounts: Record<string, number> = {};
  for (const dir of knowledgeDirs) {
    const full = path.join(KNOW_HELP_HOME, dir);
    if (fs.existsSync(full)) {
      const count = countFiles(full);
      if (count > 0) fileCounts[dir] = count;
    }
  }

  if (Object.keys(fileCounts).length > 0) {
    console.log("");
    console.log("  Your knowledge base");
    for (const [dir, count] of Object.entries(fileCounts)) {
      console.log(`    ${dir.padEnd(20)} ${count} file${count === 1 ? "" : "s"}`);
    }
  }

  console.log("\u2500".repeat(45));
  console.log("Run `know sync` to check for Mindset updates.");
  console.log("");
}

function countFiles(dir: string): number {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  const days = Math.floor(diffMins / 1440);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return d.toISOString().split("T")[0];
}
