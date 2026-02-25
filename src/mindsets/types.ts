/**
 * Mindset Platform type definitions (Prompts 11-13).
 * A Mindset is a creator's living body of professional judgment,
 * installable and subscribable via MCP.
 */

export interface MindsetManifest {
  id: string;
  creator: string;
  version: string;
  updated: string;
  name: string;
  description: string;
  triggers: string[];
  subscription?: {
    status: string;
    tier: string;
    expires: string;
    auto_renew: boolean;
  };
}

export interface MindsetFileEntry {
  id: string;
  mindset_id: string;
  filepath: string;
  load_for: string;
  size_bytes: number;
  version: string;
  s3_key: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface MindsetRecord {
  id: string;
  creator_handle: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  domain: string;
  tags: string;
  triggers: string;
  price_cents: number;
  version: string;
  file_count: number;
  s3_prefix: string;
  status: string;
  subscriber_count: number;
  last_updated_at: string;
  published_at: string;
  created_at: string;
}

export interface SubscriptionRecord {
  id: string;
  mindset_id: string;
  subscriber_email: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: string;
  current_period_end: string;
  install_token: string;
  created_at: string;
  cancelled_at: string | null;
}

export interface InstalledMindset {
  id: string;
  creator_slug: string;
  name: string;
  version: string;
  install_token: string;
  installed_at: string;
  last_synced_at: string;
  subscription_status: string;
  subscription_expires: string;
  file_count: number;
  triggers: string;
}

export interface SubscriptionStatus {
  mindset_id: string;
  creator_slug: string;
  status: "active" | "cancelled" | "past_due" | "expired";
  current_period_end: string;
}

export interface CreatorProfile {
  handle: string;
  email: string;
  display_name: string;
  bio: string;
  headline: string;
  domain: string;
  credentials: string;
  work_samples: string;
  profile_image_url: string;
  verification_status: string;
  subscriber_count: number;
  mindset_count: number;
  slug: string;
  stripe_account_id: string;
  onboarded: number;
  total_earned_cents: number;
  created_at: string;
}

export interface VerificationSubmission {
  id: string;
  creator_handle: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  status: string;
  rejection_reason: string | null;
  portfolio_url: string;
  linkedin_url: string;
  additional_info: string;
}

export interface SyncResult {
  updated: string[];
  current: string[];
  failed: string[];
}

export interface SearchMindsetResult {
  filepath: string;
  mindset_id: string;
  creator: string;
  load_for: string;
  relevance_score: number;
}
