import * as fs from "fs";
import * as path from "path";
import {
  MINDSETS_DIR,
  ensureMindsetDirs,
  mindsetDir,
  walkMindsetDir,
} from "./paths";
import {
  cacheInstalledMindset,
  removeInstalledMindset,
  getInstalledMindsets,
  getInstalledMindset,
} from "./cache";
import { writeClaudeMd } from "../utils/triggers";

const API_URL = process.env.KNOW_HELP_API_URL || "https://know.help/api";

/**
 * Install a Mindset from the know.help API.
 */
export async function installMindset(
  creatorSlug: string,
  installToken: string
): Promise<{ success: boolean; filesInstalled: string[]; message: string }> {
  ensureMindsetDirs();

  // Check if already installed
  const existing = getInstalledMindset(creatorSlug);
  if (existing) {
    return {
      success: false,
      filesInstalled: [],
      message: `Mindset "${creatorSlug}" is already installed. Run "know sync" to update.`,
    };
  }

  // Fetch mindset files from API
  const res = await fetch(`${API_URL}/mindsets/sync/${creatorSlug}/files`, {
    headers: {
      Authorization: `Bearer ${installToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    return {
      success: false,
      filesInstalled: [],
      message: `Install failed: ${res.status} — ${err}`,
    };
  }

  const data = (await res.json()) as {
    mindset: {
      id: string;
      slug: string;
      name: string;
      creator: string;
      version: string;
      triggers: string[];
      description: string;
    };
    manifest: string;
    files: Record<string, { content: string; hash: string; load_for: string }>;
  };

  // Create local directory
  const dir = mindsetDir(creatorSlug);
  fs.mkdirSync(dir, { recursive: true });

  // Write MINDSET.md manifest
  fs.writeFileSync(path.join(dir, "MINDSET.md"), data.manifest, "utf-8");

  // Write all files
  const filesInstalled: string[] = ["MINDSET.md"];
  for (const [fp, fileData] of Object.entries(data.files)) {
    const fullPath = path.join(dir, fp);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, fileData.content, "utf-8");
    filesInstalled.push(fp);
  }

  // Cache installation
  cacheInstalledMindset({
    id: data.mindset.id,
    creator_slug: creatorSlug,
    name: data.mindset.name,
    version: data.mindset.version,
    install_token: installToken,
    file_count: filesInstalled.length,
    triggers: JSON.stringify(data.mindset.triggers),
  });

  // Regenerate CLAUDE.md
  writeClaudeMd();

  // Log install event to API (non-blocking)
  fetch(`${API_URL}/mindsets/activity/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creator_slug: creatorSlug, event: "install" }),
  }).catch(() => {});

  return {
    success: true,
    filesInstalled,
    message: `Installed ${data.mindset.name} by ${data.mindset.creator}. ${filesInstalled.length} judgment files ready.`,
  };
}

/**
 * Remove an installed Mindset.
 */
export function removeMindset(creatorSlug: string): { success: boolean; message: string } {
  const dir = mindsetDir(creatorSlug);

  if (!fs.existsSync(dir)) {
    return {
      success: false,
      message: `Mindset "${creatorSlug}" is not installed.`,
    };
  }

  // Remove directory
  fs.rmSync(dir, { recursive: true, force: true });

  // Remove from cache
  removeInstalledMindset(creatorSlug);

  // Regenerate CLAUDE.md
  writeClaudeMd();

  return {
    success: true,
    message: `Removed "${creatorSlug}". CLAUDE.md updated.`,
  };
}

/**
 * List all installed Mindsets with status information.
 */
export function listInstalledMindsets(): Array<{
  creator_slug: string;
  name: string;
  version: string;
  subscription_status: string;
  last_synced_at: string;
  file_count: number;
}> {
  return getInstalledMindsets().map((m) => ({
    creator_slug: m.creator_slug,
    name: m.name,
    version: m.version,
    subscription_status: m.subscription_status,
    last_synced_at: m.last_synced_at,
    file_count: m.file_count,
  }));
}

/**
 * Get status summary for all installed Mindsets.
 */
export function getMindsetStatus(): {
  installed_count: number;
  last_sync: string | null;
  file_count: number;
  mindsets: Array<{
    creator: string;
    name: string;
    version: string;
    status: string;
    expires: string;
  }>;
} {
  const installed = getInstalledMindsets();
  let totalFiles = 0;
  let lastSync: string | null = null;

  const mindsets = installed.map((m) => {
    totalFiles += m.file_count;
    if (!lastSync || (m.last_synced_at && m.last_synced_at > lastSync)) {
      lastSync = m.last_synced_at;
    }
    return {
      creator: m.creator_slug,
      name: m.name,
      version: m.version,
      status: m.subscription_status,
      expires: m.subscription_expires,
    };
  });

  return {
    installed_count: installed.length,
    last_sync: lastSync,
    file_count: totalFiles,
    mindsets,
  };
}
