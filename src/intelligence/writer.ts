import * as fs from "fs";
import * as path from "path";
import { KNOWLEDGE_DIR } from "../utils/paths";
import { appendJsonl } from "../utils/jsonl";
import { Signal } from "./extractor";

const INTELLIGENCE_SECTION = "## Intelligence feed";

/**
 * Write a signal to the target knowledge file (confidence >= threshold)
 * or to skipped.jsonl (confidence < threshold).
 * NEVER overwrites — append only.
 */
export function writeSignal(
  signal: Signal,
  confidenceThreshold: number
): { written: boolean; target: string } {
  if (!signal.relevant) {
    return logSkipped(signal, "not_relevant");
  }

  if (signal.confidence < confidenceThreshold) {
    return logSkipped(signal, "low_confidence");
  }

  // Write to the target knowledge file
  const targetPath = path.join(KNOWLEDGE_DIR, signal.file_target);
  const targetDir = path.dirname(targetPath);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Format the intelligence entry
  const dateStr = signal.source_date.split("T")[0] || new Date().toISOString().split("T")[0];
  const entry = `\n**[${dateStr}] ${signal.signal_type}** — ${signal.summary}\n> Source: ${signal.source_url}\n> Action: ${signal.action}\n`;

  if (!fs.existsSync(targetPath)) {
    // Create new file with front matter and intelligence section
    const slug = path.basename(signal.file_target, ".md");
    const content = `---\nLoad for: ${slug}, intelligence\nLast updated: ${dateStr}\n---\n\n# ${slug}\n\n${INTELLIGENCE_SECTION}\n${entry}`;
    fs.writeFileSync(targetPath, content, "utf-8");
  } else {
    // Append to existing file
    let content = fs.readFileSync(targetPath, "utf-8");

    if (content.includes(INTELLIGENCE_SECTION)) {
      // Append after the intelligence feed section header
      content = content.replace(
        INTELLIGENCE_SECTION,
        INTELLIGENCE_SECTION + "\n" + entry
      );
      fs.writeFileSync(targetPath, content, "utf-8");
    } else {
      // Append the section at the end
      fs.appendFileSync(
        targetPath,
        `\n${INTELLIGENCE_SECTION}\n${entry}`,
        "utf-8"
      );
    }
  }

  return { written: true, target: signal.file_target };
}

/**
 * Log a skipped signal to skipped.jsonl.
 */
function logSkipped(
  signal: Signal,
  reason: string
): { written: boolean; target: string } {
  const skippedFile = path.join(KNOWLEDGE_DIR, "log", "skipped.jsonl");

  appendJsonl(
    skippedFile,
    {
      date: new Date().toISOString(),
      reason,
      confidence: signal.confidence,
      signal_type: signal.signal_type,
      summary: signal.summary,
      source_url: signal.source_url,
      file_target: signal.file_target,
    },
    {
      _schema: "skipped_signal",
      _version: "1.0",
      _description: "Signals below confidence threshold or marked not relevant",
    }
  );

  return { written: false, target: "log/skipped.jsonl" };
}
