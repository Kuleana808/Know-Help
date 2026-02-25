/**
 * know list — Machine-readable JSON output of installed Mindsets
 */

import * as fs from "fs";
import * as path from "path";
import { getInstalledMindsets } from "../mindsets/cache";
import { KNOW_HELP_HOME } from "../mindsets/paths";

export async function listCommand(): Promise<void> {
  const installed = getInstalledMindsets();

  // Count user files
  const userFiles: Record<string, number> = {};
  const knowledgeDirs = ["core", "venture", "network", "platform", "planning"];
  for (const dir of knowledgeDirs) {
    const full = path.join(KNOW_HELP_HOME, dir);
    if (fs.existsSync(full)) {
      const count = countFiles(full);
      if (count > 0) userFiles[dir] = count;
    }
  }

  const output = {
    mindsets: installed.map((m) => ({
      slug: m.creator_slug,
      name: m.name,
      version: m.version,
      domain: "", // Not stored in cache yet
      status: m.subscription_status,
      file_count: m.file_count,
      last_synced: m.last_synced_at || null,
    })),
    user_files: userFiles,
  };

  console.log(JSON.stringify(output, null, 2));
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
