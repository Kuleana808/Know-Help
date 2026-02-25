import * as fs from "fs";
import * as path from "path";
import { KNOWLEDGE_DIR } from "../utils/paths";
import { appendJsonl } from "../utils/jsonl";
import { PackManifest, InstalledPack } from "./types";

const INSTALLED_LOG = path.join(KNOWLEDGE_DIR, "log", "installed-packs.jsonl");
const MERGE_DIVIDER = "\n\n---\n\n<!-- Appended from knowledge pack -->\n\n";

/**
 * Validate a pack.json manifest.
 */
export function validatePack(manifest: PackManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id) errors.push("Missing 'id'");
  if (!manifest.name) errors.push("Missing 'name'");
  if (!manifest.author) errors.push("Missing 'author'");
  if (!manifest.version) errors.push("Missing 'version'");
  if (!manifest.description) errors.push("Missing 'description'");
  if (!manifest.category) errors.push("Missing 'category'");
  if (!manifest.files || manifest.files.length === 0)
    errors.push("Missing or empty 'files' array");
  if (!["replace", "append", "skip"].includes(manifest.merge_strategy))
    errors.push(
      `Invalid merge_strategy: '${manifest.merge_strategy}'. Must be 'replace', 'append', or 'skip'`
    );

  return errors;
}

/**
 * Install a pack from a local directory path.
 * Copies files according to merge_strategy.
 * Logs installation to installed-packs.jsonl.
 */
export function installPack(packDir: string): {
  success: boolean;
  filesInstalled: string[];
  errors: string[];
} {
  const manifestPath = path.join(packDir, "pack.json");
  if (!fs.existsSync(manifestPath)) {
    return {
      success: false,
      filesInstalled: [],
      errors: ["pack.json not found in pack directory"],
    };
  }

  const manifest: PackManifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8")
  );
  const validationErrors = validatePack(manifest);
  if (validationErrors.length > 0) {
    return { success: false, filesInstalled: [], errors: validationErrors };
  }

  const packKnowledgeDir = path.join(packDir, "knowledge");
  if (!fs.existsSync(packKnowledgeDir)) {
    return {
      success: false,
      filesInstalled: [],
      errors: ["No knowledge/ directory found in pack"],
    };
  }

  const filesInstalled: string[] = [];
  const errors: string[] = [];

  for (const file of manifest.files) {
    const sourcePath = path.join(packKnowledgeDir, file);
    const destPath = path.join(KNOWLEDGE_DIR, file);

    if (!fs.existsSync(sourcePath)) {
      errors.push(`Source file not found: ${file}`);
      continue;
    }

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const destExists = fs.existsSync(destPath);

    switch (manifest.merge_strategy) {
      case "replace":
        fs.copyFileSync(sourcePath, destPath);
        filesInstalled.push(file);
        break;

      case "append":
        if (destExists) {
          const newContent = fs.readFileSync(sourcePath, "utf-8");
          fs.appendFileSync(destPath, MERGE_DIVIDER + newContent, "utf-8");
        } else {
          fs.copyFileSync(sourcePath, destPath);
        }
        filesInstalled.push(file);
        break;

      case "skip":
        if (!destExists) {
          fs.copyFileSync(sourcePath, destPath);
          filesInstalled.push(file);
        }
        break;
    }
  }

  // Log installation
  const installEntry: InstalledPack = {
    date: new Date().toISOString(),
    pack_id: manifest.id,
    pack_name: manifest.name,
    version: manifest.version,
    files_installed: filesInstalled,
    merge_strategy: manifest.merge_strategy,
  };

  appendJsonl(INSTALLED_LOG, installEntry as unknown as Record<string, unknown>, {
    _schema: "installed_pack",
    _version: "1.0",
    _description: "Log of installed knowledge packs",
  });

  return {
    success: errors.length === 0,
    filesInstalled,
    errors,
  };
}

/**
 * Get list of installed packs.
 */
export function getInstalledPacks(): InstalledPack[] {
  if (!fs.existsSync(INSTALLED_LOG)) return [];

  const lines = fs
    .readFileSync(INSTALLED_LOG, "utf-8")
    .split("\n")
    .filter(Boolean);
  const packs: InstalledPack[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (!parsed._schema) {
        packs.push(parsed);
      }
    } catch {
      // skip invalid lines
    }
  }

  return packs;
}
