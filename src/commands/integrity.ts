/**
 * File integrity verification for installed Mindsets.
 * Writes and reads .integrity files with SHA256 hashes.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface IntegrityRecord {
  version: string;
  installedAt: string;
  files: Record<string, string>; // filepath -> sha256
}

/**
 * Compute SHA256 hash of content.
 */
export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Write .integrity file for an installed Mindset.
 */
export function writeIntegrityFile(
  mindsetDir: string,
  version: string,
  files: Record<string, string> // filepath -> content
): void {
  const record: IntegrityRecord = {
    version,
    installedAt: new Date().toISOString(),
    files: {},
  };

  for (const [fp, content] of Object.entries(files)) {
    record.files[fp] = sha256(content);
  }

  fs.writeFileSync(
    path.join(mindsetDir, ".integrity"),
    JSON.stringify(record, null, 2),
    "utf-8"
  );
}

/**
 * Read .integrity file. Returns null if not found.
 */
export function readIntegrityFile(mindsetDir: string): IntegrityRecord | null {
  const fp = path.join(mindsetDir, ".integrity");
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Verify downloaded file content against expected hash.
 * Returns true if hash matches.
 */
export function verifyFileHash(content: string, expectedHash: string): boolean {
  return sha256(content) === expectedHash;
}

/**
 * Verify all files in a Mindset directory against .integrity record.
 * Returns list of files that fail verification.
 */
export function verifyIntegrity(mindsetDir: string): string[] {
  const record = readIntegrityFile(mindsetDir);
  if (!record) return ["[.integrity file missing]"];

  const failures: string[] = [];
  for (const [fp, expectedHash] of Object.entries(record.files)) {
    const fullPath = path.join(mindsetDir, fp);
    if (!fs.existsSync(fullPath)) {
      failures.push(`${fp} (file missing)`);
      continue;
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    if (sha256(content) !== expectedHash) {
      failures.push(`${fp} (hash mismatch)`);
    }
  }

  return failures;
}
