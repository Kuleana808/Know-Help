import * as path from "path";

/** Disallowed file extensions for Mindset content */
const EXECUTABLE_EXTENSIONS = [".sh", ".js", ".ts", ".py", ".rb", ".exe", ".bat", ".cmd", ".ps1"];

/**
 * Validate a MINDSET.md manifest object.
 * Returns array of error strings (empty = valid).
 */
export function validateManifest(manifest: Record<string, any>): string[] {
  const errors: string[] = [];

  if (!manifest.name || typeof manifest.name !== "string") {
    errors.push("MINDSET.md must include 'name'");
  }
  if (!manifest.creator || typeof manifest.creator !== "string") {
    errors.push("MINDSET.md must include 'creator'");
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    errors.push("MINDSET.md must include 'version'");
  }
  if (!manifest.description || typeof manifest.description !== "string") {
    errors.push("MINDSET.md must include 'description'");
  }
  if (!Array.isArray(manifest.triggers) || manifest.triggers.length === 0) {
    errors.push("MINDSET.md must include at least one trigger keyword");
  }

  return errors;
}

/**
 * Validate a collection of Mindset files.
 * Returns array of error strings.
 */
export function validateMindsetFiles(
  files: Record<string, string>
): string[] {
  const errors: string[] = [];
  const filePaths = Object.keys(files);

  if (filePaths.length < 5) {
    errors.push(`At least 5 files required, found ${filePaths.length}`);
  }

  if (filePaths.length > 50) {
    errors.push(`Maximum 50 files allowed, found ${filePaths.length}`);
  }

  for (const fp of filePaths) {
    const ext = path.extname(fp).toLowerCase();

    // Check for executable files
    if (EXECUTABLE_EXTENSIONS.includes(ext)) {
      errors.push(`Executable file not allowed: ${fp}`);
      continue;
    }

    // Markdown files must have "Load for:" trigger header
    if (ext === ".md") {
      const content = files[fp];
      const fileErrors = validateMindsetFile(fp, content);
      errors.push(...fileErrors);
    }
  }

  return errors;
}

/**
 * Validate a single Mindset file.
 */
export function validateMindsetFile(filepath: string, content: string): string[] {
  const errors: string[] = [];
  const ext = path.extname(filepath).toLowerCase();

  if (ext === ".md") {
    // Must have "Load for:" in frontmatter or first few lines
    if (!content.includes("Load for:")) {
      errors.push(`${filepath}: missing "Load for:" trigger header`);
    }
  }

  return errors;
}

/**
 * Check if a filepath is safe (no traversal, no absolute paths).
 */
export function isPathSafe(filepath: string): boolean {
  if (path.isAbsolute(filepath)) return false;
  const normalized = path.normalize(filepath);
  if (normalized.startsWith("..") || normalized.includes("..")) return false;
  return true;
}

/**
 * Validate the complete publishing payload.
 */
export function validatePublishPayload(payload: {
  manifest: Record<string, any>;
  files: Record<string, string>;
}): string[] {
  const errors: string[] = [];

  errors.push(...validateManifest(payload.manifest));
  errors.push(...validateMindsetFiles(payload.files));

  // Check all file paths are safe
  for (const fp of Object.keys(payload.files)) {
    if (!isPathSafe(fp)) {
      errors.push(`Unsafe file path: ${fp}`);
    }
  }

  return errors;
}
