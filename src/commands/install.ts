/**
 * know install — Download and install a Mindset from know.help
 */

import * as fs from "fs";
import * as path from "path";
import { checkAuth } from "./auth";
import { sha256, writeIntegrityFile, readIntegrityFile } from "./integrity";
import { detectInjection, detectMindsetInjection } from "../lib/injection-detector";
import { quickPIICheck } from "../lib/pii-scrubber";
import {
  MINDSETS_DIR,
  ensureMindsetDirs,
  mindsetDir,
} from "../mindsets/paths";
import {
  cacheInstalledMindset,
  getInstalledMindset,
} from "../mindsets/cache";
import { writeClaudeMd } from "../utils/triggers";

const API_URL = process.env.KNOW_HELP_API_URL || "https://know.help/api";

interface InstallOptions {
  token?: string;
  free?: boolean;
  debug?: boolean;
}

export async function installCommand(
  creatorSlug: string,
  options: InstallOptions
): Promise<void> {
  ensureMindsetDirs();

  // 1. Resolve authentication
  let token = options.token;
  if (!token && !options.free) {
    const auth = await checkAuth();
    if (auth) {
      token = auth.token;
    }
  }

  if (!token && !options.free) {
    console.error("\u2717 Not authenticated.");
    console.error("  Run 'know login' first, or subscribe at know.help/" + creatorSlug);
    process.exit(1);
  }

  // 2. Fetch Mindset manifest
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/mindsets/sync/${creatorSlug}/files`, { headers });
  } catch (err: any) {
    console.error("\u2717 Connection failed. Check your internet and try again.");
    if (options.debug) console.error(err);
    process.exit(1);
  }

  if (res.status === 404) {
    console.error(`\u2717 No Mindset found for '${creatorSlug}'. Check the handle and try again.`);
    process.exit(1);
  }
  if (res.status === 402) {
    console.error(`\u2717 This Mindset requires a subscription.`);
    console.error(`  Subscribe at: know.help/${creatorSlug}`);
    process.exit(1);
  }
  if (res.status === 401) {
    console.error(`\u2717 Install token is invalid or expired.`);
    console.error(`  Get a new one at: know.help/${creatorSlug}`);
    process.exit(1);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    console.error(`\u2717 Install failed: ${res.status} — ${errText}`);
    process.exit(1);
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
      domain?: string;
    };
    manifest: string;
    files: Record<string, { content: string; hash: string; load_for: string }>;
  };

  // 3. Check for existing installation
  const existing = getInstalledMindset(creatorSlug);
  const integrity = existing ? readIntegrityFile(mindsetDir(creatorSlug)) : null;
  if (existing && integrity && integrity.version === data.mindset.version) {
    console.log(`\u2713 Already up to date (${creatorSlug} v${data.mindset.version}). Run 'know sync' to check for updates.`);
    return;
  }
  if (existing) {
    console.log(`Updating ${creatorSlug} from v${existing.version} to v${data.mindset.version}...`);
  }

  // 4. Security scan (before writing anything)
  const securityLog: string[] = [];
  const fileContents: Record<string, string> = {};
  let skippedFiles = 0;

  for (const [fp, fileData] of Object.entries(data.files)) {
    const content = fileData.content;

    // Injection detection (high threshold for install-time blocking)
    const injection = detectInjection(content);
    const mindsetInjection = detectMindsetInjection(content);
    const maxConfidence = Math.max(injection.confidence, mindsetInjection.confidence);

    if (maxConfidence >= 0.85) {
      console.log(`\u26A0 File '${fp}' was flagged for potential injection content and was not installed.`);
      securityLog.push(`${new Date().toISOString()} BLOCKED ${fp} injection_confidence=${maxConfidence}`);
      skippedFiles++;
      continue;
    }

    // SHA256 verification (if hash provided by API)
    if (fileData.hash) {
      const computed = sha256(content);
      if (computed !== fileData.hash) {
        console.error(`\u2717 Download verification failed for '${fp}'. Try again.`);
        process.exit(1);
      }
    }

    // PII check (warn but don't block — creator already approved)
    if (quickPIICheck(content)) {
      if (options.debug) {
        console.log(`\u26A0 PII detected in '${fp}' (creator-approved, continuing)`);
      }
    }

    fileContents[fp] = content;
  }

  // Write security log if any issues
  if (securityLog.length > 0) {
    const logDir = path.join(require("os").homedir(), ".know-help");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, "security.log"),
      securityLog.join("\n") + "\n",
      "utf-8"
    );
  }

  // 5. Download files — write to disk
  const dir = mindsetDir(creatorSlug);
  fs.mkdirSync(dir, { recursive: true });

  // Write MINDSET.md manifest
  fs.writeFileSync(path.join(dir, "MINDSET.md"), data.manifest, "utf-8");

  // Write all passed files
  const filesInstalled: string[] = ["MINDSET.md"];
  for (const [fp, content] of Object.entries(fileContents)) {
    const fullPath = path.join(dir, fp);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    filesInstalled.push(fp);
  }

  // 6. Store integrity record
  const allContents: Record<string, string> = { "MINDSET.md": data.manifest, ...fileContents };
  writeIntegrityFile(dir, data.mindset.version, allContents);

  // 7. Cache installation
  cacheInstalledMindset({
    id: data.mindset.id,
    creator_slug: creatorSlug,
    name: data.mindset.name,
    version: data.mindset.version,
    install_token: token || "",
    file_count: filesInstalled.length,
    triggers: JSON.stringify(data.mindset.triggers || []),
  });

  // 8. Regenerate CLAUDE.md
  writeClaudeMd();

  // 9. Print success
  const domains = new Set(
    Object.keys(fileContents).map((fp) => fp.split("/")[0]).filter(Boolean)
  );
  const triggers = data.mindset.triggers || [];

  console.log("");
  console.log(`\u2713 Installed ${data.mindset.creator || creatorSlug} \u2014 ${data.mindset.name} (v${data.mindset.version})`);
  console.log(`  ${filesInstalled.length} judgment files ready across ${domains.size} domains:`);
  console.log(`  ${[...domains].join("  ")}`);
  if (triggers.length > 0) {
    console.log(`  Loaded when you're working on:`);
    console.log(`  ${triggers.join(", ")}`);
  }
  if (skippedFiles > 0) {
    console.log(`\n\u26A0 ${skippedFiles} file(s) skipped due to security flags.`);
  }
  console.log("");
  console.log("Your Claude config includes this automatically. Need to configure Claude Desktop? Run:");
  console.log("  know serve --config");

  // 10. Log install event to API (fire-and-forget)
  fetch(`${API_URL}/mindsets/activity/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creator_slug: creatorSlug,
      event: "install",
      version: data.mindset.version,
    }),
  }).catch(() => {});
}
