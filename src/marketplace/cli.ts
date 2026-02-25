#!/usr/bin/env node
/**
 * know — CLI for installing and managing Mindsets.
 * Published to npm as know-help.
 */

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";

// Legacy pack imports (backward-compatible)
import { installPack, getInstalledPacks } from "./installer";
import { listPacks } from "./registry";
import { PackManifest } from "./types";
import { slugify } from "../utils/paths";

// New command imports
import { installCommand } from "../commands/install";
import { syncCommand } from "../commands/sync";
import { statusCommand } from "../commands/status";
import { listCommand } from "../commands/list";
import { removeCommand } from "../commands/remove";
import { publishCommand, publishInitCommand } from "../commands/publish";
import { loginCommand } from "../commands/login";
import { logoutCommand } from "../commands/logout";
import { serveCommand } from "../commands/serve";

const program = new Command();

program
  .name("know")
  .description("know.help — Install and run Mindsets, professional judgment for your AI")
  .version("0.1.0")
  .option("--debug", "Show verbose output and stack traces");

// ── Mindset Commands ────────────────────────────────────────────────────────

program
  .command("install <target>")
  .description("Install a Mindset or local knowledge pack")
  .option("--token <token>", "Install token from subscription")
  .option("--free", "Install a free Mindset (no token needed)")
  .action(async (target: string, options: any) => {
    const debug = program.opts().debug;

    // Detect local path (pack) vs remote Mindset slug
    const isLocal =
      target.startsWith("./") ||
      target.startsWith("/") ||
      target.startsWith("../") ||
      fs.existsSync(path.resolve(target));

    if (isLocal && !options.token) {
      await installPackLegacy(target);
    } else {
      await installCommand(target, { ...options, debug });
    }
  });

program
  .command("sync [creator-slug]")
  .description("Check for and download Mindset updates")
  .action(async (creatorSlug?: string) => {
    const debug = program.opts().debug;
    await syncCommand(creatorSlug, { debug });
  });

program
  .command("status")
  .description("Show installed Mindsets, subscriptions, and knowledge base")
  .action(async () => {
    await statusCommand();
  });

program
  .command("list")
  .description("List installed Mindsets (JSON output)")
  .action(async () => {
    await listCommand();
  });

program
  .command("remove <creator-slug>")
  .description("Remove an installed Mindset")
  .action(async (creatorSlug: string) => {
    await removeCommand(creatorSlug);
  });

program
  .command("publish [directory]")
  .description("Publish a Mindset to know.help")
  .option("--init", "Scaffold a new Mindset directory")
  .option("--dry-run", "Show what would change without uploading")
  .action(async (directory: string | undefined, options: any) => {
    const debug = program.opts().debug;
    if (options.init) {
      await publishInitCommand();
    } else {
      await publishCommand(directory, { dryRun: options.dryRun, debug });
    }
  });

program
  .command("login")
  .description("Authenticate with know.help")
  .action(async () => {
    await loginCommand();
  });

program
  .command("logout")
  .description("Clear stored credentials")
  .action(async () => {
    await logoutCommand();
  });

program
  .command("serve")
  .description("Start MCP server for Claude Desktop")
  .option("--config", "Print Claude Desktop configuration block")
  .option("--port <port>", "Custom port")
  .action(async (options: any) => {
    await serveCommand(options);
  });

// ── Legacy Pack Commands ────────────────────────────────────────────────────

program
  .command("list-packs [category]")
  .description("Browse available knowledge packs")
  .action(async (category?: string) => {
    console.log(
      category ? `\nAvailable packs (${category}):\n` : "\nAvailable packs:\n"
    );
    const packs = await listPacks(category);
    if (packs.length === 0) {
      console.log("  No packs found.");
    } else {
      for (const pack of packs) {
        const price = pack.price_usd === 0 ? "Free" : `$${pack.price_usd}`;
        console.log(`  ${pack.name} (${pack.id})`);
        console.log(`    Author: ${pack.author} | Price: ${price} | Downloads: ${pack.downloads}`);
        console.log(`    ${pack.description}`);
        console.log("");
      }
    }
  });

program
  .command("create-pack")
  .description("Scaffold a new knowledge pack")
  .action(async () => {
    const readline = require("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> =>
      new Promise((resolve) => rl.question(q, (a: string) => resolve(a.trim())));

    console.log("\nCreate a new knowledge pack\n");
    const name = await ask("Pack name: ");
    const description = await ask("Description: ");
    const category = await ask("Category (sales/content/planning/core): ");
    const priceStr = await ask("Price in USD (0 for free): ");
    rl.close();

    const price = parseInt(priceStr, 10) || 0;
    const id = slugify(name);
    const packDir = path.resolve(id);

    fs.mkdirSync(path.join(packDir, "knowledge", category), { recursive: true });

    const manifest: PackManifest = {
      id, name, author: "", version: "1.0.0", description, category,
      tags: [], price_usd: price, install_path: category, files: [],
      merge_strategy: "append",
    };

    fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(manifest, null, 2), "utf-8");
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
    console.log("  1. Add knowledge files to the knowledge/ directory");
    console.log("  2. Update pack.json with files list and author");
    console.log(`  3. Test: know install ./${id}`);
    console.log("  4. Submit to the registry");
  });

program
  .command("installed")
  .description("Show installed knowledge packs")
  .action(async () => {
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
  });

// ── Local pack install helper ───────────────────────────────────────────────

async function installPackLegacy(packPath: string): Promise<void> {
  const resolved = path.resolve(packPath);

  if (!fs.existsSync(resolved)) {
    console.error(`\u2717 Pack directory not found: ${resolved}`);
    process.exit(1);
  }

  const manifestPath = path.join(resolved, "pack.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("\u2717 No pack.json found in the specified directory");
    process.exit(1);
  }

  const manifest: PackManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  console.log(`\nPack: ${manifest.name} v${manifest.version}`);
  console.log(`Author: ${manifest.author}`);
  console.log(`Description: ${manifest.description}`);

  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question("\nInstall to /knowledge? (y/n): ", (a: string) => resolve(a.trim()));
  });
  rl.close();

  if (answer.toLowerCase() !== "y") {
    console.log("Installation cancelled.");
    return;
  }

  const result = installPack(resolved);

  if (result.filesInstalled.length > 0) {
    console.log(`\n\u2713 Installed ${result.filesInstalled.length} files:`);
    result.filesInstalled.forEach((f) => console.log(`  + ${f}`));
  }
  if (result.errors.length > 0) {
    console.log("\nWarnings:");
    result.errors.forEach((e) => console.log(`  ! ${e}`));
  }

  console.log(result.success ? "\nPack installed successfully." : "\nPack installed with warnings.");
}

// ── Parse and run ───────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  if (program.opts().debug) {
    console.error(err);
  } else {
    console.error(`\u2717 ${err.message || err}`);
  }
  process.exit(1);
});
