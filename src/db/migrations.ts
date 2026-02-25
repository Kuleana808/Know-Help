import { Database as DatabaseType } from "better-sqlite3";

/**
 * Idempotent migrations for Prompts 11-13 (Mindset Platform).
 * Each migration uses CREATE TABLE IF NOT EXISTS or checks PRAGMA table_info
 * before ALTER TABLE to ensure safe re-runs.
 */
export function runMigrations(db: DatabaseType): void {
  // --- ALTER TABLE creators: add Mindset-era columns ---
  const creatorCols = db
    .prepare("PRAGMA table_info(creators)")
    .all()
    .map((c: any) => c.name);

  const creatorAdditions: Record<string, string> = {
    display_name: "TEXT",
    bio: "TEXT",
    headline: "TEXT",
    domain: "TEXT",
    credentials: "TEXT",
    work_samples: "TEXT",
    profile_image_url: "TEXT",
    verification_status: "TEXT DEFAULT 'unverified'",
    verification_notes: "TEXT",
    subscriber_count: "INTEGER DEFAULT 0",
    mindset_count: "INTEGER DEFAULT 0",
    slug: "TEXT",
  };

  for (const [col, type] of Object.entries(creatorAdditions)) {
    if (!creatorCols.includes(col)) {
      db.exec(`ALTER TABLE creators ADD COLUMN ${col} ${type}`);
    }
  }

  // --- New tables for Mindset system ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS mindsets (
      id TEXT PRIMARY KEY,
      creator_handle TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT,
      description TEXT,
      domain TEXT,
      tags TEXT,
      triggers TEXT,
      price_cents INTEGER DEFAULT 0,
      version TEXT DEFAULT '1.0.0',
      file_count INTEGER DEFAULT 0,
      s3_prefix TEXT,
      status TEXT DEFAULT 'draft',
      subscriber_count INTEGER DEFAULT 0,
      last_updated_at TEXT,
      published_at TEXT,
      created_at TEXT,
      FOREIGN KEY (creator_handle) REFERENCES creators(handle)
    );

    CREATE TABLE IF NOT EXISTS mindset_files (
      id TEXT PRIMARY KEY,
      mindset_id TEXT NOT NULL,
      filepath TEXT NOT NULL,
      load_for TEXT,
      size_bytes INTEGER DEFAULT 0,
      version TEXT,
      s3_key TEXT,
      content_hash TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (mindset_id) REFERENCES mindsets(id),
      UNIQUE(mindset_id, filepath)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      mindset_id TEXT NOT NULL,
      subscriber_email TEXT NOT NULL,
      stripe_subscription_id TEXT,
      stripe_customer_id TEXT,
      status TEXT DEFAULT 'active',
      current_period_end TEXT,
      install_token TEXT UNIQUE,
      created_at TEXT,
      cancelled_at TEXT,
      FOREIGN KEY (mindset_id) REFERENCES mindsets(id),
      UNIQUE(subscriber_email, mindset_id)
    );

    CREATE TABLE IF NOT EXISTS verification_submissions (
      id TEXT PRIMARY KEY,
      creator_handle TEXT NOT NULL,
      submitted_at TEXT,
      reviewed_at TEXT,
      reviewed_by TEXT,
      status TEXT DEFAULT 'pending',
      rejection_reason TEXT,
      portfolio_url TEXT,
      linkedin_url TEXT,
      additional_info TEXT,
      FOREIGN KEY (creator_handle) REFERENCES creators(handle)
    );

    CREATE TABLE IF NOT EXISTS featured_mindsets (
      mindset_id TEXT PRIMARY KEY,
      position INTEGER DEFAULT 0,
      featured_at TEXT,
      featured_by TEXT,
      FOREIGN KEY (mindset_id) REFERENCES mindsets(id)
    );

    CREATE TABLE IF NOT EXISTS mindset_sync_events (
      id TEXT PRIMARY KEY,
      subscription_id TEXT,
      subscriber_email TEXT,
      mindset_id TEXT,
      event_type TEXT,
      files_changed TEXT,
      version_from TEXT,
      version_to TEXT,
      created_at TEXT
    );
  `);
}
