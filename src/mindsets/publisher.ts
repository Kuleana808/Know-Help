import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { parseMindsetManifest, walkMindsetDir, slugify } from "./paths";
import { validatePublishPayload } from "./validation";

const API_URL = process.env.KNOW_HELP_API_URL || "https://know.help/api";

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * Interactive setup for a new Mindset: know publish --init
 */
export async function publishInit(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n📦 Create a new Mindset\n");

  const name = await ask(rl, "Mindset name: ");
  const domain = await ask(rl, "Domain (e.g., brand-design, sales, engineering): ");
  const description = await ask(rl, "Description (1-2 sentences): ");
  const triggersRaw = await ask(rl, "Trigger keywords (comma-separated): ");
  const triggers = triggersRaw.split(",").map((t) => t.trim()).filter(Boolean);

  rl.close();

  const slug = slugify(name);
  const dir = process.cwd();

  // Create MINDSET.md manifest
  const manifest = `---
id: ${slug}
creator: ${path.basename(dir)}
version: 1.0.0
updated: ${new Date().toISOString().split("T")[0]}
name: "${name}"
description: "${description}"
triggers:
${triggers.map((t) => `  - ${t}`).join("\n")}
---

# ${name}

${description}
`;

  fs.writeFileSync(path.join(dir, "MINDSET.md"), manifest, "utf-8");

  // Create starter directories
  const dirs = ["core", domain || "general", "voice"];
  for (const d of dirs) {
    const fullDir = path.join(dir, d);
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }
  }

  // Create starter files
  const starterFiles: Record<string, string> = {
    [`core/philosophy.md`]: `---
Load for: ${triggers.slice(0, 3).join(", ")}, philosophy, principles
---

# Core Philosophy

<!-- Your foundational principles go here -->
`,
    [`core/approach.md`]: `---
Load for: ${triggers.slice(0, 3).join(", ")}, approach, methodology
---

# Approach

<!-- How you think about your domain -->
`,
    [`${domain || "general"}/getting-started.md`]: `---
Load for: ${triggers.slice(0, 3).join(", ")}, getting started, basics
---

# Getting Started

<!-- Key concepts and frameworks -->
`,
    [`voice/critique.md`]: `---
Load for: feedback, critique, review, red lines
---

# How I Give Feedback

<!-- Your feedback style and absolute constraints -->
`,
    [`voice/red-lines.md`]: `---
Load for: constraints, never do, avoid, red lines
---

# Red Lines

<!-- Things you would never approve or recommend -->
`,
  };

  for (const [fp, content] of Object.entries(starterFiles)) {
    const fullPath = path.join(dir, fp);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");
    }
  }

  console.log(`\n✅ Mindset scaffolded: "${name}"`);
  console.log(`   MINDSET.md created`);
  console.log(`   ${Object.keys(starterFiles).length} starter files created`);
  console.log(`   ${dirs.length} directories: ${dirs.join(", ")}`);
  console.log(`\n   Edit the files, then run: know publish`);
}

/**
 * Publish a Mindset to know.help: know publish [directory]
 */
export async function publishMindset(dir?: string): Promise<void> {
  const targetDir = dir || process.cwd();

  // Read MINDSET.md
  const manifestPath = path.join(targetDir, "MINDSET.md");
  if (!fs.existsSync(manifestPath)) {
    console.error("❌ No MINDSET.md found in", targetDir);
    console.error("   Run 'know publish --init' to create one.");
    process.exit(1);
  }

  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  const manifest = parseMindsetManifest(manifestContent);
  if (!manifest) {
    console.error("❌ Invalid MINDSET.md — could not parse frontmatter");
    process.exit(1);
  }

  console.log(`\n📤 Publishing "${manifest.name}" v${manifest.version}\n`);

  // Collect all files (excluding MINDSET.md itself)
  const allFiles = walkMindsetDir(targetDir)
    .filter((f: string) => f !== "MINDSET.md" && !f.startsWith("."));

  const files: Record<string, string> = {};
  for (const fp of allFiles) {
    const fullPath = path.join(targetDir, fp);
    files[fp] = fs.readFileSync(fullPath, "utf-8");
  }

  console.log(`   ${allFiles.length} files found`);

  // Validate
  const errors = validatePublishPayload({ manifest, files });
  if (errors.length > 0) {
    console.error("❌ Validation errors:");
    for (const err of errors) {
      console.error(`   - ${err}`);
    }
    process.exit(1);
  }

  console.log("   ✅ Validation passed");

  // Read API token
  let token = process.env.KNOW_HELP_TOKEN || "";
  if (!token) {
    const configPath = path.join(
      require("os").homedir(),
      ".know-help",
      "config.json"
    );
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        token = config.token || "";
      } catch {
        // No config
      }
    }
  }

  if (!token) {
    console.error("❌ No API token found.");
    console.error("   Set KNOW_HELP_TOKEN env var or run 'know login'");
    process.exit(1);
  }

  // Upload to API
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
      console.error(`❌ Publish failed: ${(err as any).error}`);
      if ((err as any).errors) {
        for (const e of (err as any).errors) {
          console.error(`   - ${e}`);
        }
      }
      process.exit(1);
    }

    const result = (await res.json()) as {
      success: boolean;
      mindset_id: string;
      message: string;
    };

    console.log(`\n✅ ${result.message}`);
    console.log(`   Mindset ID: ${result.mindset_id}`);
    console.log(`   Status: Submitted for review`);
    console.log(`\n   We review within 48 hours. You'll get an email when it's live.`);
  } catch (err: any) {
    console.error(`❌ Network error: ${err.message}`);
    process.exit(1);
  }
}
