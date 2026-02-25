/**
 * know sync — Check for and download Mindset updates
 */

import * as fs from "fs";
import * as path from "path";
import { checkAuth } from "./auth";
import { sha256, writeIntegrityFile } from "./integrity";
import { detectInjection, detectMindsetInjection } from "../lib/injection-detector";
import {
  MINDSETS_DIR,
  mindsetDir,
} from "../mindsets/paths";
import {
  getInstalledMindsets,
  updateMindsetVersion,
  logSyncEvent,
} from "../mindsets/cache";
import { writeClaudeMd } from "../utils/triggers";

const API_URL = process.env.KNOW_HELP_API_URL || "https://know.help/api";

interface SyncOptions {
  debug?: boolean;
}

export async function syncCommand(
  creatorSlug?: string,
  options: SyncOptions = {}
): Promise<void> {
  const auth = await checkAuth();
  const token = auth?.token || "";

  const installed = getInstalledMindsets();
  const targets = creatorSlug
    ? installed.filter((m) => m.creator_slug === creatorSlug)
    : installed;

  if (targets.length === 0) {
    if (creatorSlug) {
      console.log(`Mindset '${creatorSlug}' is not installed.`);
    } else {
      console.log("No Mindsets installed to sync.");
    }
    return;
  }

  console.log("");
  let updated = 0;
  let current = 0;
  let failed = 0;

  for (const mindset of targets) {
    process.stdout.write(`  ${mindset.name || mindset.creator_slug}... `);

    try {
      // Check version
      const versionRes = await fetch(
        `${API_URL}/mindsets/sync/${mindset.creator_slug}/version`
      );

      if (versionRes.status === 402) {
        console.log(`\u26A0 subscription expired. Files kept locally.`);
        console.log(`    Renew at: know.help/${mindset.creator_slug}`);
        failed++;
        continue;
      }
      if (versionRes.status === 403) {
        console.log(`\u26A0 subscription cancelled. Files kept locally.`);
        failed++;
        continue;
      }
      if (!versionRes.ok) {
        console.log(`\u2717 (API error ${versionRes.status})`);
        failed++;
        continue;
      }

      const versionData = (await versionRes.json()) as { version: string; updatedAt: string };

      if (versionData.version === mindset.version) {
        console.log(`\u2713 up to date (v${mindset.version})`);
        current++;
        continue;
      }

      // Download update
      const filesRes = await fetch(
        `${API_URL}/mindsets/sync/${mindset.creator_slug}/files`,
        {
          headers: {
            Authorization: `Bearer ${(mindset as any).install_token || token}`,
          },
        }
      );

      if (!filesRes.ok) {
        console.log(`\u2717 (download error ${filesRes.status})`);
        failed++;
        continue;
      }

      const filesData = (await filesRes.json()) as any;
      const dir = mindsetDir(mindset.creator_slug);

      // Write MINDSET.md
      fs.writeFileSync(path.join(dir, "MINDSET.md"), filesData.manifest, "utf-8");

      // Write files with security scanning
      const changedFiles: string[] = [];
      const addedFiles: string[] = [];
      const fileContents: Record<string, string> = { "MINDSET.md": filesData.manifest };

      for (const [fp, fileInfo] of Object.entries(filesData.files) as any[]) {
        const content = fileInfo.content;

        // Security scan
        const injection = detectInjection(content);
        const mindsetInj = detectMindsetInjection(content);
        if (Math.max(injection.confidence, mindsetInj.confidence) >= 0.85) {
          if (options.debug) {
            console.log(`\n    \u26A0 Skipped '${fp}' (injection detected)`);
          }
          continue;
        }

        // SHA256 verify if hash provided
        if (fileInfo.hash) {
          const computed = sha256(content);
          if (computed !== fileInfo.hash) {
            if (options.debug) {
              console.log(`\n    \u26A0 Hash mismatch for '${fp}', skipping`);
            }
            continue;
          }
        }

        const fullPath = path.join(dir, fp);
        const existed = fs.existsSync(fullPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, "utf-8");
        fileContents[fp] = content;

        if (existed) {
          changedFiles.push(fp);
        } else {
          addedFiles.push(fp);
        }
      }

      // Write integrity
      writeIntegrityFile(dir, filesData.mindset.version, fileContents);

      // Update cache
      updateMindsetVersion(
        mindset.creator_slug,
        filesData.mindset.version,
        Object.keys(fileContents).length
      );
      logSyncEvent(
        mindset.id,
        "sync",
        mindset.version,
        filesData.mindset.version,
        [...changedFiles, ...addedFiles]
      );

      // Print diff summary
      console.log(`\u2191 v${mindset.version} \u2192 v${filesData.mindset.version}`);
      if (changedFiles.length > 0) {
        console.log(`    Updated: ${changedFiles.join(", ")}`);
      }
      if (addedFiles.length > 0) {
        console.log(`    Added:   ${addedFiles.join(", ")}`);
      }
      if (changedFiles.length === 0 && addedFiles.length === 0) {
        console.log(`    (metadata updated)`);
      }

      updated++;
    } catch (err: any) {
      console.log(`\u2717 (${err.message})`);
      if (options.debug) console.error(err);
      failed++;
    }
  }

  console.log("");
  if (updated === 0 && failed === 0) {
    console.log("All Mindsets up to date.");
  } else {
    console.log(`Sync complete: ${updated} updated, ${current} current, ${failed} failed`);
  }

  // Regenerate CLAUDE.md
  writeClaudeMd();
}
