/**
 * know publish — Publish or scaffold a Mindset
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { checkAuth } from "./auth";
import { sha256 } from "./integrity";
import { detectMindsetInjection } from "../lib/injection-detector";
import { quickPIICheck, scanForPII } from "../lib/pii-scrubber";
import {
  parseMindsetManifest,
  walkMindsetDir,
  slugify,
} from "../mindsets/paths";
import { validatePublishPayload } from "../mindsets/validation";

const API_URL = process.env.KNOW_HELP_API_URL || "https://know.help/api";

interface PublishOptions {
  init?: boolean;
  dryRun?: boolean;
  debug?: boolean;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * know publish --init — Scaffold a new Mindset
 */
export async function publishInitCommand(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("");

  const name = (await ask(rl, "? Mindset name: ")).trim();
  const description = (await ask(rl, "? One-line description: ")).trim();
  const domain = (await ask(rl, "? Domain: ")).trim();
  const triggersRaw = (await ask(rl, "? Trigger keywords (comma-separated): ")).trim();
  const priceStr = (await ask(rl, "? Price per month (or 0 for free): ")).trim();

  rl.close();

  const triggers = triggersRaw.split(",").map((t) => t.trim()).filter(Boolean);
  const slug = slugify(name);
  const dir = path.join(process.cwd(), "mindset");

  fs.mkdirSync(dir, { recursive: true });

  // Create MINDSET.md
  const manifest = `---
id: ${slug}
name: "${name}"
description: "${description}"
domain: "${domain}"
version: 1.0.0
price: ${priceStr || "0"}
triggers:
${triggers.map((t) => `  - ${t}`).join("\n")}
updated: ${new Date().toISOString().split("T")[0]}
---

# ${name}

${description}
`;

  fs.writeFileSync(path.join(dir, "MINDSET.md"), manifest, "utf-8");

  // Create directories
  const dirs = ["core", domain || "general", "voice"];
  for (const d of dirs) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }

  // Create starter files
  const starterFiles: Record<string, string> = {
    "core/philosophy.md": `---
Load for: ${triggers.slice(0, 3).join(", ")}, philosophy, principles
---

# Core Philosophy

<!-- Your foundational principles go here -->
`,
    "core/approach.md": `---
Load for: ${triggers.slice(0, 3).join(", ")}, approach, methodology
---

# Approach

<!-- How you think about your domain -->
`,
    "voice/red-lines.md": `---
Load for: constraints, never do, avoid, red lines
---

# Red Lines

<!-- Things you would never approve or recommend -->
`,
  };

  // Add domain-specific starter
  const domainDir = domain || "general";
  starterFiles[`${domainDir}/getting-started.md`] = `---
Load for: ${triggers.slice(0, 3).join(", ")}, getting started, basics
---

# Getting Started

<!-- Key concepts and frameworks -->
`;

  for (const [fp, content] of Object.entries(starterFiles)) {
    const fullPath = path.join(dir, fp);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }

  console.log("");
  console.log("\u2713 Created mindset/ directory with starter files.");
  console.log("");
  console.log("Edit the files, then run: know publish mindset/");
  console.log("");
  console.log("Files created:");
  console.log("  mindset/MINDSET.md");
  for (const fp of Object.keys(starterFiles)) {
    console.log(`  mindset/${fp}`);
  }
}

/**
 * know publish [directory] — Publish a Mindset to know.help
 */
export async function publishCommand(
  dir?: string,
  options: PublishOptions = {}
): Promise<void> {
  const targetDir = dir ? path.resolve(dir) : process.cwd();

  // 1. Validate directory
  const manifestPath = path.join(targetDir, "MINDSET.md");
  if (!fs.existsSync(manifestPath)) {
    console.error("\u2717 No MINDSET.md found in " + targetDir);
    console.error("  Run 'know publish --init' to create one.");
    process.exit(1);
  }

  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  const manifest = parseMindsetManifest(manifestContent);
  if (!manifest) {
    console.error("\u2717 Invalid MINDSET.md — could not parse frontmatter");
    process.exit(1);
  }

  // Collect all files
  const allFiles = walkMindsetDir(targetDir)
    .filter((f: string) => f !== "MINDSET.md" && !f.startsWith("."));

  if (allFiles.length < 3) {
    console.error(`\u2717 Mindset needs at least 3 .md files (found ${allFiles.length})`);
    process.exit(1);
  }

  const files: Record<string, string> = {};
  for (const fp of allFiles) {
    files[fp] = fs.readFileSync(path.join(targetDir, fp), "utf-8");
  }

  // 2. Validate
  const errors = validatePublishPayload({ manifest, files });
  if (errors.length > 0) {
    console.error("\u2717 Validation errors:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(`\nPublishing "${manifest.name}" v${manifest.version}`);
  console.log(`  ${allFiles.length} files found`);

  // 3. Security scan
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let blocked = false;

  for (const [fp, content] of Object.entries(files)) {
    const injection = detectMindsetInjection(content);

    // Hard block
    if (injection.detected && injection.confidence >= 0.85) {
      console.error(`\u26A0 ${fp} contains instruction-like content that could affect subscribers. Edit it and try again.`);
      blocked = true;
      continue;
    }

    // Soft warn
    if (injection.detected && injection.confidence >= 0.7) {
      const answer = await new Promise<string>((resolve) => {
        rl.question(`\u26A0 ${fp} has content that might look like instructions. Publish anyway? [y/N] `, resolve);
      });
      if (answer.trim().toLowerCase() !== "y") {
        blocked = true;
        continue;
      }
    }

    // PII check
    if (quickPIICheck(content)) {
      const piiResult = await scanForPII(content);
      if (piiResult.hasPII) {
        const preview = piiResult.redactedText.slice(0, 200);
        const answer = await new Promise<string>((resolve) => {
          rl.question(`\u26A0 ${fp} may contain personal information: ${preview}... Publish anyway? [y/N] `, resolve);
        });
        if (answer.trim().toLowerCase() !== "y") {
          blocked = true;
          continue;
        }
      }
    }
  }

  rl.close();

  if (blocked) {
    console.error("\n\u2717 Publish aborted due to security flags.");
    process.exit(1);
  }

  // 4. Diff against current published version (if not dry-run, fetch current)
  let diffSummary: { added: string[]; changed: string[]; removed: string[] } | null = null;

  const auth = await checkAuth();
  const token = auth?.token || "";

  if (token) {
    try {
      const currentRes = await fetch(
        `${API_URL}/mindsets/sync/${manifest.id || manifest.slug}/files`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (currentRes.ok) {
        const currentData = (await currentRes.json()) as any;
        const currentFiles = new Set(Object.keys(currentData.files || {}));
        const localFiles = new Set(Object.keys(files));

        diffSummary = {
          added: [...localFiles].filter((f) => !currentFiles.has(f)),
          changed: [...localFiles].filter((f) => {
            if (!currentFiles.has(f)) return false;
            const currentHash = currentData.files[f]?.hash;
            return currentHash && currentHash !== sha256(files[f]);
          }),
          removed: [...currentFiles].filter((f) => !localFiles.has(f)),
        };
      }
    } catch {
      // First publish — no diff
    }
  }

  // If --dry-run: print diff and exit
  if (options.dryRun) {
    console.log("\n[Dry run] Changes that would be published:");
    if (diffSummary) {
      if (diffSummary.added.length > 0) console.log(`  Added:   ${diffSummary.added.join(", ")}`);
      if (diffSummary.changed.length > 0) console.log(`  Updated: ${diffSummary.changed.join(", ")}`);
      if (diffSummary.removed.length > 0) console.log(`  Removed: ${diffSummary.removed.join(", ")}`);
      if (diffSummary.added.length === 0 && diffSummary.changed.length === 0 && diffSummary.removed.length === 0) {
        console.log("  No changes detected.");
      }
    } else {
      console.log("  All files (first publish):");
      for (const fp of allFiles) console.log(`    + ${fp}`);
    }
    console.log("\nNo changes were uploaded.");
    return;
  }

  // 5. Authenticate
  if (!token) {
    console.error("\u2717 You need a creator account to publish.");
    console.error("  Apply at know.help/creator/apply");
    process.exit(1);
  }

  // 6. Upload
  try {
    const res = await fetch(`${API_URL}/mindsets/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ manifest, files }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      console.error(`\u2717 Publish failed: ${(err as any).error}`);
      if ((err as any).errors) {
        for (const e of (err as any).errors) console.error(`  - ${e}`);
      }
      process.exit(1);
    }

    const result = (await res.json()) as {
      success: boolean;
      mindset_id: string;
      message: string;
      version?: string;
      subscribers_notified?: number;
    };

    console.log(`\n\u2713 ${result.message || "Published successfully"}`);
    if (result.version) {
      console.log(`  Version: ${result.version}`);
    }
    if (diffSummary) {
      console.log("  Changes:");
      if (diffSummary.added.length > 0) console.log(`    Added:   ${diffSummary.added.join(", ")}`);
      if (diffSummary.changed.length > 0) console.log(`    Updated: ${diffSummary.changed.join(", ")}`);
      if (diffSummary.removed.length > 0) console.log(`    Removed: ${diffSummary.removed.join(", ")}`);
    }
    if (result.subscribers_notified) {
      console.log(`  ${result.subscribers_notified} subscribers will receive the update on their next sync.`);
    }
  } catch (err: any) {
    console.error(`\u2717 Connection failed. Check your internet and try again.`);
    if (options.debug) console.error(err);
    process.exit(1);
  }
}
