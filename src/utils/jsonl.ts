import * as fs from "fs";
import * as path from "path";

/**
 * Append a JSON entry to a JSONL file. Creates the file with a schema line if it doesn't exist.
 * NEVER overwrites — append only.
 */
export function appendJsonl(
  filePath: string,
  entry: Record<string, unknown>,
  schema?: { _schema: string; _version: string; _description: string }
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath) && schema) {
    fs.writeFileSync(filePath, JSON.stringify(schema) + "\n", "utf-8");
  }

  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

/**
 * Read all entries from a JSONL file (skipping schema lines).
 */
export function readJsonl(filePath: string): Record<string, unknown>[] {
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const entries: Record<string, unknown>[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (!parsed._schema) {
        entries.push(parsed);
      }
    } catch {
      // skip invalid lines
    }
  }

  return entries;
}

/**
 * Extract _schema from the first line of a JSONL file.
 */
export function extractJsonlSchema(
  content: string
): { schema: string; description: string } | null {
  const firstLine = content.split("\n")[0];
  try {
    const parsed = JSON.parse(firstLine);
    if (parsed._schema) {
      return {
        schema: parsed._schema,
        description: parsed._description || "",
      };
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/**
 * Count entries in a JSONL file (excluding schema lines).
 */
export function countJsonlEntries(filePath: string): number {
  return readJsonl(filePath).length;
}

/**
 * Check if an entry exists in a JSONL file based on a field value.
 */
export function jsonlEntryExists(
  filePath: string,
  field: string,
  value: string
): boolean {
  const entries = readJsonl(filePath);
  return entries.some(
    (e) =>
      typeof e[field] === "string" &&
      (e[field] as string).toLowerCase() === value.toLowerCase()
  );
}
