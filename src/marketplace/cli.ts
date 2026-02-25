#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { installPack, getInstalledPacks, validatePack } from "./installer";
import { listPacks } from "./registry";
import { PackManifest } from "./types";
import { slugify } from "../utils/paths";
import {
  installMindset,
  removeMindset,
  listInstalledMindsets,
  getMindsetStatus,
} from "../mindsets/installer";
import { publishInit, publishMindset } from "../mindsets/publisher";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/**
 * Detect if the install target is a local path (pack) or a remote mindset slug.
 */
function isLocalPath(target: string): boolean {
  return (
    target.startsWith("./") ||
    target.startsWith("/") ||
    target.startsWith("../") ||
    fs.existsSync(path.resolve(target))
  );
}

// ── Pack Commands ───────────────────────────────────────────────────────────

async function cmdInstall(target: string, token?: string): Promise<void> {
  if (isLocalPath(target) && !token) {
    // Local pack installation
    await cmdInstallPack(target);
  } else {
    // Remote Mindset installation
    await cmdInstallMindset(target, token);
  }
}

async function cmdInstallPack(packPath: string): Promise<void> {
  const resolved = path.resolve(packPath);

  if (!fs.existsSync(resolved)) {
    console.error(`Error: Pack directory not found: ${resolved}`);
    process.exit(1);
  }

  const manifestPath = path.join(resolved, "pack.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("Error: No pack.json found in the specified directory");
    process.exit(1);
  }

  const manifest: PackManifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8")
  );

  console.log(`\nPack: ${manifest.name} v${manifest.version}`);
  console.log(`Author: ${manifest.author}`);
  console.log(`Description: ${manifest.description}`);
  console.log(`Category: ${manifest.category}`);
  console.log(`Merge strategy: ${manifest.merge_strategy}`);
  console.log(`Files:`);
  manifest.files.forEach((f) => console.log(`  - ${f}`));

  const confirm = await ask("\nInstall to /knowledge? (y/n): ");
  if (confirm.toLowerCase() !== "y") {
    console.log("Installation cancelled.");
    rl.close();
    return;
  }

  const result = installPack(resolved);

  if (result.filesInstalled.length > 0) {
    console.log(`\nInstalled ${result.filesInstalled.length} files:`);
    result.filesInstalled.forEach((f) => console.log(`  + ${f}`));
  }

  if (result.errors.length > 0) {
    console.log("\nWarnings:");
    result.errors.forEach((e) => console.log(`  ! ${e}`));
  }

  console.log(
    result.success ? "\nPack installed successfully." : "\nPack installed with warnings."
  );
  rl.close();
}

async function cmdInstallMindset(creatorSlug: string, token?: string): Promise<void> {
  if (!token) {
    // Check for --token flag
    const tokenIdx = process.argv.indexOf("--token");
    if (tokenIdx !== -1 && process.argv[tokenIdx + 1]) {
      token = process.argv[tokenIdx + 1];
    }
  }

  if (!token) {
    console.error("Error: Install token required for Mindset installation");
    console.error("Usage: know install <creator-slug> --token <token>");
    console.error("\nGet your token at know.help after subscribing.");
    rl.close();
    process.exit(1);
  }

  console.log(`\nInstalling Mindset: ${creatorSlug}...`);

  try {
    const result = await installMindset(creatorSlug, token);

    if (result.success) {
      console.log(`\n✅ ${result.message}`);
      console.log(`\nFiles installed:`);
      for (const f of result.filesInstalled) {
        console.log(`  + ${f}`);
      }

      // Print Claude Desktop config
      console.log(`\n── Claude Desktop Configuration ──────────────────`);
      console.log(`Add this to your Claude Desktop config:\n`);
      console.log(JSON.stringify({
        mcpServers: {
          "know-help": {
            command: "npx",
            args: ["know-help@latest", "serve"],
            env: {
              KNOW_HELP_TOKEN: token,
            },
          },
        },
      }, null, 2));
      console.log("");
    } else {
      console.error(`\n❌ ${result.message}`);
    }
  } catch (err: any) {
    console.error(`\n❌ Installation failed: ${err.message}`);
  }

  rl.close();
}

// ── Mindset Commands ────────────────────────────────────────────────────────

async function cmdList(): Promise<void> {
  const mindsets = listInstalledMindsets();

  if (mindsets.length === 0) {
    console.log("\nNo Mindsets installed.");
    console.log("Browse available Mindsets at https://know.help/mindsets");
  } else {
    console.log(`\nInstalled Mindsets (${mindsets.length}):\n`);
    for (const m of mindsets) {
      const status = m.subscription_status === "active" ? "✅" : "⚠️";
      console.log(`  ${status} ${m.name} (${m.creator_slug})`);
      console.log(`     Version: ${m.version} | Files: ${m.file_count} | Status: ${m.subscription_status}`);
      console.log(`     Last synced: ${m.last_synced_at?.split("T")[0] || "never"}`);
      console.log("");
    }
  }
  rl.close();
}

async function cmdSync(): Promise<void> {
  console.log("\nSyncing Mindsets...\n");

  const { MINDSETS_DIR, CONFIG_FILE } = require("../mindsets/paths");
  const { getInstalledMindsets, updateMindsetVersion, logSyncEvent } = require("../mindsets/cache");

  const API_URL = process.env.KNOW_HELP_API_URL || "https://know.help/api";
  let token = process.env.KNOW_HELP_TOKEN || "";

  if (!token && fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      token = config.token || "";
    } catch {}
  }

  const installed = getInstalledMindsets();
  if (installed.length === 0) {
    console.log("No Mindsets installed to sync.");
    rl.close();
    return;
  }

  let updated = 0;
  let current = 0;
  let failed = 0;

  for (const mindset of installed) {
    process.stdout.write(`  ${mindset.name}... `);

    try {
      const versionRes = await fetch(
        `${API_URL}/mindsets/sync/${mindset.creator_slug}/version`
      );
      if (!versionRes.ok) {
        console.log(`❌ (API error ${versionRes.status})`);
        failed++;
        continue;
      }

      const versionData = (await versionRes.json()) as { version: string };

      if (versionData.version === mindset.version) {
        console.log(`✅ up to date (v${mindset.version})`);
        current++;
        continue;
      }

      // Download update
      const filesRes = await fetch(
        `${API_URL}/mindsets/sync/${mindset.creator_slug}/files`,
        { headers: { Authorization: `Bearer ${mindset.install_token || token}` } }
      );

      if (!filesRes.ok) {
        console.log(`❌ (download error ${filesRes.status})`);
        failed++;
        continue;
      }

      const filesData = (await filesRes.json()) as any;
      const mindsetDir = path.join(MINDSETS_DIR, mindset.creator_slug);

      // Write MINDSET.md
      fs.writeFileSync(path.join(mindsetDir, "MINDSET.md"), filesData.manifest, "utf-8");

      // Write files
      const changedFiles: string[] = [];
      for (const [fp, data] of Object.entries(filesData.files)) {
        const fullPath = path.join(mindsetDir, fp);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, (data as any).content, "utf-8");
        changedFiles.push(fp);
      }

      updateMindsetVersion(mindset.creator_slug, filesData.mindset.version, Object.keys(filesData.files).length);
      logSyncEvent(mindset.id, "sync", mindset.version, filesData.mindset.version, changedFiles);

      console.log(`🔄 updated v${mindset.version} → v${filesData.mindset.version} (${changedFiles.length} files)`);
      updated++;
    } catch (err: any) {
      console.log(`❌ (${err.message})`);
      failed++;
    }
  }

  console.log(`\nSync complete: ${updated} updated, ${current} current, ${failed} failed`);

  // Regenerate CLAUDE.md
  const { writeClaudeMd } = require("../utils/triggers");
  writeClaudeMd();

  rl.close();
}

async function cmdRemove(creatorSlug: string): Promise<void> {
  const confirm = await ask(`Remove Mindset "${creatorSlug}"? This cannot be undone. (y/n): `);
  if (confirm.toLowerCase() !== "y") {
    console.log("Cancelled.");
    rl.close();
    return;
  }

  const result = removeMindset(creatorSlug);
  console.log(result.success ? `\n✅ ${result.message}` : `\n❌ ${result.message}`);
  rl.close();
}

async function cmdStatus(): Promise<void> {
  const status = getMindsetStatus();

  console.log("\n── know.help Status ──────────────────────────────\n");
  console.log(`  Installed Mindsets: ${status.installed_count}`);
  console.log(`  Total files: ${status.file_count}`);
  console.log(`  Last sync: ${status.last_sync?.split("T")[0] || "never"}`);

  if (status.mindsets.length > 0) {
    console.log("\n  Subscriptions:");
    for (const m of status.mindsets) {
      const icon = m.status === "active" ? "✅" : m.status === "past_due" ? "⚠️" : "❌";
      console.log(`    ${icon} ${m.name} — ${m.status}${m.expires ? ` (expires ${m.expires.split("T")[0]})` : ""}`);
    }
  }

  // Also show installed packs
  const packs = getInstalledPacks();
  if (packs.length > 0) {
    console.log(`\n  Installed Packs: ${packs.length}`);
  }

  console.log("");
  rl.close();
}

async function cmdPublish(dir?: string): Promise<void> {
  rl.close(); // Publisher uses its own readline
  await publishMindset(dir);
}

async function cmdPublishInit(): Promise<void> {
  rl.close(); // Publisher uses its own readline
  await publishInit();
}

// ── Pack Commands (original) ────────────────────────────────────────────────

async function cmdListPacks(category?: string): Promise<void> {
  console.log(
    category
      ? `\nAvailable packs (${category}):\n`
      : "\nAvailable packs:\n"
  );

  const packs = await listPacks(category);

  if (packs.length === 0) {
    console.log("  No packs found.");
  } else {
    for (const pack of packs) {
      const price =
        pack.price_usd === 0 ? "Free" : `$${pack.price_usd}`;
      console.log(`  ${pack.name} (${pack.id})`);
      console.log(`    Author: ${pack.author} | Price: ${price} | Downloads: ${pack.downloads}`);
      console.log(`    ${pack.description}`);
      console.log("");
    }
  }
  rl.close();
}

async function cmdCreatePack(): Promise<void> {
  console.log("\nCreate a new knowledge pack\n");

  const name = await ask("Pack name: ");
  const description = await ask("Description: ");
  const category = await ask("Category (sales/content/planning/core): ");
  const priceStr = await ask("Price in USD (0 for free): ");
  const price = parseInt(priceStr, 10) || 0;

  const id = slugify(name);
  const packDir = path.resolve(id);

  fs.mkdirSync(path.join(packDir, "knowledge", category), {
    recursive: true,
  });

  const manifest: PackManifest = {
    id,
    name,
    author: "",
    version: "1.0.0",
    description,
    category,
    tags: [],
    price_usd: price,
    install_path: category,
    files: [],
    merge_strategy: "append",
  };

  fs.writeFileSync(
    path.join(packDir, "pack.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  fs.writeFileSync(
    path.join(packDir, "README.md"),
    `# ${name}\n\n${description}\n\n## Installation\n\n\`\`\`\nknow install ./${id}\n\`\`\`\n`,
    "utf-8"
  );

  fs.writeFileSync(
    path.join(packDir, "PREVIEW.md"),
    `# ${name}\n\n${description}\n\n## What's included\n\nAdd your file descriptions here.\n`,
    "utf-8"
  );

  console.log(`\nPack scaffolded at: ${packDir}/`);
  console.log("Next steps:");
  console.log("  1. Add your knowledge files to the knowledge/ directory");
  console.log("  2. Update pack.json with your files list and author");
  console.log("  3. Test: know install ./" + id);
  console.log("  4. Submit to the registry");

  rl.close();
}

async function cmdInstalledPacks(): Promise<void> {
  const packs = getInstalledPacks();

  if (packs.length === 0) {
    console.log("\nNo packs installed yet.");
  } else {
    console.log(`\nInstalled packs (${packs.length}):\n`);
    for (const pack of packs) {
      console.log(`  ${pack.pack_name} v${pack.version}`);
      console.log(`    Installed: ${pack.date.split("T")[0]}`);
      console.log(`    Files: ${pack.files_installed.join(", ")}`);
      console.log("");
    }
  }
  rl.close();
}

// ── Main CLI Entry ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse --token flag
  const tokenIdx = args.indexOf("--token");
  const token = tokenIdx !== -1 ? args[tokenIdx + 1] : undefined;

  switch (command) {
    // Mindset commands
    case "install":
      if (!args[1]) {
        console.error("Usage: know install <creator-slug> --token <token>");
        console.error("       know install <pack-path>");
        process.exit(1);
      }
      await cmdInstall(args[1], token);
      break;

    case "list":
      await cmdList();
      break;

    case "sync":
      await cmdSync();
      break;

    case "remove":
      if (!args[1]) {
        console.error("Usage: know remove <creator-slug>");
        process.exit(1);
      }
      await cmdRemove(args[1]);
      break;

    case "status":
      await cmdStatus();
      break;

    case "publish":
      if (args[1] === "--init") {
        await cmdPublishInit();
      } else {
        await cmdPublish(args[1]);
      }
      break;

    // Pack commands (original)
    case "list-packs":
      await cmdListPacks(args[1]);
      break;

    case "create-pack":
      await cmdCreatePack();
      break;

    case "installed":
      await cmdInstalledPacks();
      break;

    case "serve":
      // MCP server mode — delegate to index.ts
      require("../index");
      return; // Don't close rl

    default:
      console.log("know.help — Knowledge & Mindset Manager\n");
      console.log("Mindset Commands:");
      console.log("  know install <creator-slug> --token <token>  Install a Mindset");
      console.log("  know list                                    List installed Mindsets");
      console.log("  know sync                                    Sync all Mindsets");
      console.log("  know remove <creator-slug>                   Remove a Mindset");
      console.log("  know status                                  Show subscription status");
      console.log("  know publish                                 Publish a Mindset");
      console.log("  know publish --init                          Scaffold a new Mindset");
      console.log("");
      console.log("Pack Commands:");
      console.log("  know install <pack-path>    Install a knowledge pack");
      console.log("  know list-packs [category]  Browse available packs");
      console.log("  know create-pack            Scaffold a new pack");
      console.log("  know installed              Show installed packs");
      rl.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  rl.close();
  process.exit(1);
});
