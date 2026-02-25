import * as fs from "fs";
import { KNOW_HELP_HOME, MINDSETS_DIR } from "./paths";
import { writeClaudeMd } from "../utils/triggers";

let watcherInitialized = false;

/**
 * Watch the ~/.know-help/ directory for file changes.
 * On change: regenerate CLAUDE.md to keep the routing index current.
 *
 * Uses chokidar for reliable cross-platform file watching.
 */
export function watchMindsets(): void {
  if (watcherInitialized) return;

  // Only watch if the directory exists
  if (!fs.existsSync(KNOW_HELP_HOME)) return;

  try {
    // Dynamic import to avoid hard dependency if chokidar isn't installed
    const chokidar = require("chokidar");

    const watcher = chokidar.watch(KNOW_HELP_HOME, {
      ignoreInitial: true,
      depth: 6,
      persistent: true,
      ignored: [
        /(^|[\/\\])\../, // dotfiles
        "**/cache.db",
        "**/cache.db-journal",
        "**/cache.db-wal",
      ],
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    // Debounce CLAUDE.md regeneration
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    function debouncedRegenerate() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          writeClaudeMd();
          console.error("know.help: CLAUDE.md regenerated after file change");
        } catch (err: any) {
          console.error(`know.help: CLAUDE.md regeneration failed: ${err.message}`);
        }
      }, 1000);
    }

    watcher
      .on("add", debouncedRegenerate)
      .on("change", debouncedRegenerate)
      .on("unlink", debouncedRegenerate);

    watcherInitialized = true;
    console.error("know.help: File watcher active on ~/.know-help/");
  } catch (err: any) {
    // chokidar not installed — fall back to no watching
    console.error(`know.help: File watcher unavailable (${err.message})`);
  }
}
