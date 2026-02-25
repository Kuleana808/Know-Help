#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { installPack, getInstalledPacks, validatePack } from "./installer";
import { listPacks } from "./registry";
import { PackManifest } from "./types";
import { slugify } from "../utils/paths";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function cmdInstall(packPath: string): Promise<void> {
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

async function cmdInstalled(): Promise<void> {
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

// Main CLI entry
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "install":
      if (!args[1]) {
        console.error("Usage: know install <pack-path>");
        process.exit(1);
      }
      await cmdInstall(args[1]);
      break;

    case "list-packs":
      await cmdListPacks(args[1]);
      break;

    case "create-pack":
      await cmdCreatePack();
      break;

    case "installed":
      await cmdInstalled();
      break;

    default:
      console.log("know.help — Knowledge Pack Manager\n");
      console.log("Commands:");
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
