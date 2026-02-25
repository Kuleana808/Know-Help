import Database, { Database as DatabaseType } from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { runMigrations } from "./migrations";

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "know-help.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS packs (
      id TEXT PRIMARY KEY,
      name TEXT,
      author_handle TEXT,
      version TEXT,
      price_cents INTEGER,
      category TEXT,
      description TEXT,
      long_description TEXT,
      status TEXT DEFAULT 'active',
      downloads INTEGER DEFAULT 0,
      registry_url TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      pack_id TEXT,
      buyer_email TEXT,
      stripe_payment_intent_id TEXT,
      stripe_session_id TEXT,
      amount_cents INTEGER,
      creator_payout_cents INTEGER,
      platform_fee_cents INTEGER,
      status TEXT DEFAULT 'pending',
      download_token TEXT UNIQUE,
      download_expires_at TEXT,
      installed_at TEXT,
      created_at TEXT,
      FOREIGN KEY (pack_id) REFERENCES packs(id)
    );

    CREATE TABLE IF NOT EXISTS creators (
      handle TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      stripe_account_id TEXT,
      onboarded INTEGER DEFAULT 0,
      total_earned_cents INTEGER DEFAULT 0,
      total_paid_out_cents INTEGER DEFAULT 0,
      otp_hash TEXT,
      otp_expires_at TEXT,
      session_token_hash TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      creator_handle TEXT,
      stripe_transfer_id TEXT,
      amount_cents INTEGER,
      pack_ids TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT,
      FOREIGN KEY (creator_handle) REFERENCES creators(handle)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_status TEXT DEFAULT 'trialing',
      subscription_tier TEXT DEFAULT 'pro',
      trial_ends_at TEXT,
      s3_prefix TEXT UNIQUE,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT,
      expires_at TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS crawl_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      status TEXT DEFAULT 'queued',
      sources TEXT,
      signals_written INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT,
      slug TEXT UNIQUE,
      owner_user_id TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_status TEXT DEFAULT 'trialing',
      trial_ends_at TEXT,
      s3_prefix TEXT UNIQUE,
      created_at TEXT,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT,
      user_id TEXT,
      role TEXT DEFAULT 'member',
      invited_by TEXT,
      joined_at TEXT,
      status TEXT DEFAULT 'active',
      PRIMARY KEY (team_id, user_id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS team_invitations (
      id TEXT PRIMARY KEY,
      team_id TEXT,
      invited_email TEXT,
      role TEXT DEFAULT 'member',
      invited_by TEXT,
      token TEXT UNIQUE,
      expires_at TEXT,
      accepted_at TEXT,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS file_permissions (
      team_id TEXT,
      filepath TEXT,
      visibility TEXT DEFAULT 'team',
      owner_user_id TEXT,
      PRIMARY KEY (team_id, filepath)
    );
  `);

  // Run Prompt 11-13 migrations (Mindset platform tables)
  runMigrations(db);
}

export { db };
export default db;
