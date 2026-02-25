import Database, { Database as DatabaseType } from "better-sqlite3";
import * as fs from "fs";
import { CACHE_DB_PATH, KNOW_HELP_HOME } from "./paths";
import { InstalledMindset, SubscriptionStatus } from "./types";

let cacheDb: DatabaseType | null = null;

/**
 * Get or initialize the local cache database at ~/.know-help/cache.db.
 * Used for offline Mindset tracking and subscription caching.
 */
export function getCacheDb(): DatabaseType {
  if (cacheDb) return cacheDb;

  if (!fs.existsSync(KNOW_HELP_HOME)) {
    fs.mkdirSync(KNOW_HELP_HOME, { recursive: true });
  }

  cacheDb = new Database(CACHE_DB_PATH);
  cacheDb.pragma("journal_mode = WAL");

  cacheDb.exec(`
    CREATE TABLE IF NOT EXISTS installed_mindsets (
      id TEXT PRIMARY KEY,
      creator_slug TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      install_token TEXT,
      installed_at TEXT NOT NULL,
      last_synced_at TEXT,
      subscription_status TEXT DEFAULT 'active',
      subscription_expires TEXT,
      file_count INTEGER DEFAULT 0,
      triggers TEXT
    );

    CREATE TABLE IF NOT EXISTS subscription_cache (
      mindset_id TEXT PRIMARY KEY,
      creator_slug TEXT NOT NULL,
      status TEXT NOT NULL,
      current_period_end TEXT,
      checked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mindset_id TEXT,
      event TEXT,
      version_from TEXT,
      version_to TEXT,
      files_changed TEXT,
      synced_at TEXT
    );
  `);

  return cacheDb;
}

/**
 * Get all installed Mindsets from local cache.
 */
export function getInstalledMindsets(): InstalledMindset[] {
  const db = getCacheDb();
  return db.prepare("SELECT * FROM installed_mindsets ORDER BY name").all() as InstalledMindset[];
}

/**
 * Get a single installed Mindset by creator slug.
 */
export function getInstalledMindset(creatorSlug: string): InstalledMindset | null {
  const db = getCacheDb();
  const row = db
    .prepare("SELECT * FROM installed_mindsets WHERE creator_slug = ?")
    .get(creatorSlug);
  return (row as InstalledMindset) || null;
}

/**
 * Record a newly installed Mindset.
 */
export function cacheInstalledMindset(mindset: {
  id: string;
  creator_slug: string;
  name: string;
  version: string;
  install_token: string;
  file_count: number;
  triggers: string;
}): void {
  const db = getCacheDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO installed_mindsets
    (id, creator_slug, name, version, install_token, installed_at, last_synced_at, subscription_status, file_count, triggers)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    mindset.id,
    mindset.creator_slug,
    mindset.name,
    mindset.version,
    mindset.install_token,
    now,
    now,
    mindset.file_count,
    mindset.triggers
  );
}

/**
 * Remove an installed Mindset from cache.
 */
export function removeInstalledMindset(creatorSlug: string): void {
  const db = getCacheDb();
  db.prepare("DELETE FROM installed_mindsets WHERE creator_slug = ?").run(creatorSlug);
  db.prepare("DELETE FROM subscription_cache WHERE creator_slug = ?").run(creatorSlug);
}

/**
 * Update subscription status in cache.
 */
export function cacheSubscriptionStatus(status: SubscriptionStatus): void {
  const db = getCacheDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO subscription_cache
    (mindset_id, creator_slug, status, current_period_end, checked_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(status.mindset_id, status.creator_slug, status.status, status.current_period_end, now);

  // Also update the installed_mindsets table
  db.prepare(`
    UPDATE installed_mindsets
    SET subscription_status = ?, subscription_expires = ?
    WHERE id = ?
  `).run(status.status, status.current_period_end, status.mindset_id);
}

/**
 * Update version and sync timestamp after a sync.
 */
export function updateMindsetVersion(
  creatorSlug: string,
  newVersion: string,
  fileCount: number
): void {
  const db = getCacheDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE installed_mindsets
    SET version = ?, file_count = ?, last_synced_at = ?
    WHERE creator_slug = ?
  `).run(newVersion, fileCount, now, creatorSlug);
}

/**
 * Get last sync timestamp.
 */
export function getLastSyncTime(): string | null {
  const db = getCacheDb();
  const row = db
    .prepare("SELECT MAX(last_synced_at) as last_sync FROM installed_mindsets")
    .get() as any;
  return row?.last_sync || null;
}

/**
 * Log a sync event.
 */
export function logSyncEvent(
  mindsetId: string,
  event: string,
  versionFrom: string,
  versionTo: string,
  filesChanged: string[]
): void {
  const db = getCacheDb();
  db.prepare(`
    INSERT INTO sync_log (mindset_id, event, version_from, version_to, files_changed, synced_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(mindsetId, event, versionFrom, versionTo, JSON.stringify(filesChanged), new Date().toISOString());
}
