# know.help Build Log

## 2026-02-25 — Prompts 1-4 (MCP Server + Waitlist + Intelligence + Marketplace)

**Built:**
- Layer 1 MCP server with 7 tools, modular architecture (tools/, utils/)
- Waitlist backend (Express API, CORS, Dockerfile)
- Living Intelligence Phase 1 (Twitter + Reddit crawlers, Claude signal extraction, writer)
- Knowledge Pack Marketplace (pack format, CLI, installer, 3 seed packs)

**Tested:** 14/14 self-tests pass. Waitlist API tested end-to-end (POST, GET count, duplicate detection). Pack installer tested with founder-core pack. TypeScript compiles with zero errors.

**Skipped:** Nothing.

**Next:** Prompt 5 (Stripe payment layer)

---

## 2026-02-25 — Prompts 5-10 (Payment + Portal + Crawlers + Dashboard + Hosted + Teams)

**Built:**

### Prompt 5: Payment Layer (Stripe)
- SQLite database with 11 tables (packs, purchases, creators, payouts, users, user_sessions, crawl_jobs, teams, team_members, team_invitations, file_permissions)
- Stripe Checkout Sessions for pack purchases
- Webhook handler (checkout.session.completed, payment_intent.payment_failed, subscription events)
- Download system with 48-hour expiring tokens
- Creator onboarding via Stripe Connect Express
- Creator dashboard with earnings tracking
- Admin payout trigger with Stripe transfers
- Resend email integration (purchase confirmation, OTP, team invitations, admin notifications)

### Prompt 6: Creator Submission Portal
- Magic link auth (6-digit OTP via Resend, JWT sessions, 7-day expiry)
- Pack submission endpoint with validation (pack.json schema, no executables, trigger headers required, max 20 files)
- Creator pack list and detail with analytics
- Admin submission queue (list pending, review, approve, reject)
- Registry auto-update on pack approval
- Email notifications (admin on new submission, creator on rejection)
- RBAC middleware (requireAuth with role checks)

### Prompt 7: LinkedIn + TikTok + RSS Crawlers (Phase 2)
- LinkedIn crawler via Apify (linkedin-post-search actor, min 20 engagement)
- TikTok crawler via Apify (clockworks/tiktok-scraper, min 500 views, 24h window)
- RSS crawler via rss-parser (6h window, no engagement filter)
- RSS auto-discovery (checks /feed, /rss, /blog/rss paths on competitor domains)
- Auto-discovered feeds saved to knowledge.config.json
- Intelligence feed trimming (max 50 entries per venture file)
- All 5 sources in single crawl orchestrator with independent failure handling

### Prompt 8: Web Dashboard
- File tree API (/api/files/tree) with metadata (type, triggers, schema, modified, size)
- File CRUD (/api/files/content, save, delete, rename) with path traversal protection
- JSONL append-only validation on save (existing lines must be preserved)
- Network contacts view (/api/network/contacts, :slug, :slug/add)
- Intelligence status, manual crawl trigger (SSE), signals feed with filtering
- Intelligence config read/write (knowledge.config.json)
- Log viewer (decisions, failures, activity by date)
- Two-step file deletion (confirm token required)

### Prompt 9: Hosted Pro Tier
- S3 file operations wrapper (local filesystem fallback for dev)
- User provisioning on first sign-in (UUID, S3 prefix, knowledge scaffold copy)
- 5-step onboarding wizard (identity, ventures, contacts, intelligence config, MCP connection)
- Stripe subscription billing (POST /billing/subscribe, GET /billing/portal)
- Usage limits enforcement (5 ventures, 500 contacts, 10 pack installs, 100MB)
- Subscription status checks (trialing, active, past_due, canceled)

### Prompt 10: Team Tier
- Team CRUD (create, create-from-pro migration, delete)
- RBAC (viewer, member, admin, owner) with permission matrix
- Team member management (invite, accept, remove, change role)
- Team invitations (72-hour expiry, email notification, auto-join on accept)
- File permissions (team visibility or private per member)
- Team activity feed endpoint
- Member limit tracking (10 included, billing for additional)
- Pro → Team migration (copies all files to team S3 prefix)

**Tested:**
- TypeScript compiles with zero errors across all ~30 source files
- 14/14 self-tests pass (MCP tools, path validation, append-only enforcement, CLAUDE.md generation)
- Database initializes with all 11 tables, correct column counts
- API server boots and all 6 route groups return 200 (health, waitlist, files, network, logs, intelligence)
- Stripe and Resend initialize with placeholder keys (fail gracefully on actual API calls)

**Skipped:**
- End-to-end Stripe test mode purchase (requires real STRIPE_SECRET_KEY)
- Apify integration testing (requires APIFY_API_TOKEN)

---

## 2026-02-25 — Post-Prompts (WebSocket MCP + Crawler Queue + Next.js Frontend)

**Built:**

### WebSocket MCP Transport
- `ws` package WebSocket server attached to HTTP server at `/mcp/ws`
- JWT auth (query param, header, or first-message auth flow)
- Full MCP protocol support (initialize, tools/list, tools/call, ping)
- All 7 MCP tools reimplemented for S3-backed hosted knowledge bases
- Connection registry with heartbeat (30s ping/pong for dead connection detection)
- Subscription validation (active/trialing check, trial expiry)
- Health endpoint enhanced with `ws_connections` count

### Managed Crawler Queue (BullMQ + Redis)
- BullMQ queue with Redis connection (Upstash or self-hosted)
- Worker with 3 concurrent crawl processors, rate limited (10/min)
- Job deduplication (no duplicate per-user jobs)
- Per-user crawl processing: reads config from S3, runs enabled sources, writes signals back to S3
- `scheduleAllUserCrawls()` — bulk-enqueue for all active subscribers
- `enqueueCrawl()` — single-user on-demand crawl
- `getQueueStats()` — waiting/active/completed/failed counts
- `getUserJobStatus()` — per-user latest job status with progress
- Graceful shutdown (`shutdownQueue()`)
- 2 retries with exponential backoff per job
- Auto-cleanup: 100 completed, 50 failed jobs retained

### Next.js 14 Frontend (14 pages)
- **Landing page** — hero, waitlist form, features grid, "how it works", pricing tiers
- **Login** — 2-step magic link auth (email → 6-digit OTP)
- **Onboarding** — 5-step wizard (identity, ventures, contacts, intelligence, MCP config)
- **Dashboard overview** — system status, file count, intelligence status, queue stats
- **Files** — directory-grouped file tree, content viewer, inline editor with save
- **Network** — contact list, interaction history, add notes
- **Intelligence** — status, source badges, run crawl (SSE), signals feed
- **Logs** — tabbed view (decisions, failures, activity by date)
- **Settings** — source toggles, crawl schedule, confidence slider, billing portal link
- **Creator portal** — pack list, status badges
- **Pack submission** — form with file editor, category, pricing
- **Admin queue** — pending submissions, approve/reject with reason
- **Team management** — create team, invite members, remove, role management

**Frontend stack:**
- Next.js 14 (App Router), React 18, TypeScript
- Tailwind CSS with custom design tokens matching landing page palette
- API proxy rewrites in dev (Next.js → Express API on port 3000)
- Custom API client with JWT auth (localStorage)
- `useApi` hook for data fetching with refetch

**Tested:**
- Backend TypeScript compiles with zero errors (~35 source files)
- 14/14 self-tests pass
- Next.js frontend builds successfully — all 14 pages compile and optimize
- All pages under 3KB individual JS, ~90KB first load shared

**Skipped:**
- End-to-end Stripe test mode purchase (requires real STRIPE_SECRET_KEY)
- Apify integration testing (requires APIFY_API_TOKEN)
- Redis integration test (requires REDIS_URL)

**Env vars needed for full operation:**
```
# Payments (Prompt 5)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
STRIPE_TEAM_PRICE_ID=
RESEND_API_KEY=
ADMIN_BEARER_TOKEN=
DATABASE_PATH=/data/know-help.db

# Auth (Prompt 6)
JWT_SECRET=
ADMIN_EMAILS=
FROM_EMAIL=hello@know.help

# Intelligence (Prompts 3+7)
ANTHROPIC_API_KEY=
TWITTER_BEARER_TOKEN=
APIFY_API_TOKEN=

# Hosted (Prompt 9)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET=know-help-user-data

# Queue (Post-Prompts)
REDIS_URL=redis://localhost:6379

# General
PORT=3000
DATA_DIR=/data
ALLOWED_ORIGINS=https://know.help,http://localhost:3000,http://localhost:8080
BASE_URL=https://know.help
```

**Resolved questions:**
1. WebSocket transport → `ws` package, attached to existing HTTP server
2. Managed crawler queue → BullMQ with Redis (auto-disabled if no REDIS_URL)
3. Frontend framework → Next.js 14 with Tailwind CSS and API proxy rewrites

**Remaining open questions:**
1. S3 conditional writes — use ETags for append-only safety or rely on application-level locking?
2. Team billing — metered billing for extra seats or simple tier-based pricing?

---

## 2026-02-25 — Prompts 11-13 (Mindset Platform: MCP Runtime + Creator Profiles + Marketplace)

**Built:**

### Prompt 11: MCP Server — Mindset Runtime

**New MCP tools (4):**
- `search_mindset` — Walks `~/.know-help/mindsets/`, reads MINDSET.md manifests, tokenizes query against trigger arrays + "Load for:" headers, returns top 5 matches by relevance score
- `load_mindset` — Loads specific judgment files from installed Mindset by creator_slug + optional topic. Path traversal protection. Logs access to activity.jsonl
- `sync_mindsets` — For each installed mindset, calls API version check, downloads updated files if newer, updates cache.db
- `check_subscriptions` — Bulk validates install tokens via API, marks expired as read-only, flags cancelled for removal

**Local infrastructure:**
- `~/.know-help/` directory structure with `mindsets/`, `cache.db`, `.sync`, `config.json`
- Local SQLite cache (`better-sqlite3`) at `~/.know-help/cache.db` for offline operation
- Tables: `installed_mindsets`, `subscription_cache`, `sync_log`
- Chokidar file watcher on `~/.know-help/` with debounced (1s) CLAUDE.md regeneration
- Auto-sync on MCP server startup: checks subscriptions + reports available updates if last sync > 24h
- Enhanced CLAUDE.md generation: adds "## Installed Mindsets" section with creator, triggers, file counts, usage instructions for `search_mindset()` + `load_mindset()` chain

**CLI commands:**
- `know install <creator-slug> --token <token>` — Detect local path vs remote slug, fetch from API, write to `~/.know-help/mindsets/`, cache subscription, regenerate CLAUDE.md, print Claude Desktop config block
- `know list` — List installed mindsets with version, sync status, subscription
- `know sync` — Manual sync all installed mindsets against API
- `know remove <creator-slug>` — Confirm + remove directory and cache entry
- `know status` — Subscription status, last sync, file count
- `know publish [dir]` — Validate and upload mindset to API
- `know publish --init` — Interactive scaffold creating MINDSET.md + starter directory with 5 template files

### Prompt 12: Creator Profiles + Mindset Publishing

**Database (6 new tables):**
- `mindsets` — id, creator_handle, slug, name, description, domain, tags, triggers, price_cents, version, file_count, s3_prefix, status, subscriber_count, last_updated_at, created_at
- `mindset_files` — id, mindset_id, filepath, load_for, size_bytes, version, s3_key, content_hash, created_at, updated_at
- `subscriptions` — id, mindset_id, subscriber_email, stripe_subscription_id, stripe_customer_id, status, current_period_end, install_token, created_at, cancelled_at
- `verification_submissions` — id, creator_id, submitted_at, reviewed_at, reviewed_by, status, rejection_reason
- `featured_mindsets` — mindset_id, position, featured_at, featured_by
- `mindset_sync_events` — id, mindset_id, event_type, old_version, new_version, changed_files, created_at
- ALTER TABLE `creators` with 12 new columns (display_name, bio, headline, domain, credentials, work_samples, profile_image_url, verification_status, verification_notes, subscriber_count, mindset_count, slug)

**API routes (Express router at /api/mindsets):**
- Public: `GET /` list, `GET /featured`, `GET /categories`, `GET /detail/:slug`, `GET /creator/:handle`, `GET /category/:category`
- Creator (auth): `POST /publish`, `GET /mine`, `GET /:id/files`, `GET /:id/file-content`, `PUT /:id/save-file`, `GET /:id/subscribers`
- Sync: `POST /subscribe`, `POST /subscriptions/validate`, `GET /sync/:slug/version`, `GET /sync/:slug/files`, `POST /activity/log`
- Verification: `POST /creators/apply`, `PUT /creators/profile`, `GET /creators/me`
- Admin: `GET /admin/pending`, `POST /admin/approve`, `POST /admin/reject`, `POST /admin/feature`, `GET /admin/verifications`, `POST /admin/verifications/approve`, `POST /admin/verifications/reject`

**Checkout:**
- Stripe subscription mode with `application_fee_percent: 30` (70/30 creator/platform split)
- Install token generation (SHA-256 of subscription ID + secret)
- Webhook integration for `customer.subscription.created`, `updated`, `deleted`

**Creator portal (Next.js, 8 pages):**
- Creator dashboard — overview with stats (mindsets, subscribers, revenue, payouts), verification status
- My Mindsets — list with status badges, subscriber count, revenue per mindset
- New Mindset wizard — 3-step flow (info → triggers/pricing → review), creates via API
- Mindset editor — file tree sidebar, markdown editor, "Load for:" trigger field per file, save/publish
- Profile settings — edit profile, handle (URL slug), Stripe Connect onboarding
- Verification — submit credentials, portfolio, LinkedIn, statement; shows status
- Payouts — earnings summary, revenue by mindset table, Stripe dashboard link

### Prompt 13: Marketplace Index

**Marketplace pages (Next.js, 4 pages):**
- Marketplace index (`/mindsets`) — hero ("Install expertise. Not employees."), featured section (3 curated), category filter pills, sort (featured/newest/subscribers/updated), 3-column grid of mindset cards, CTA for creators
- Mindset detail (`/mindsets/[slug]`) — dark theme, creator byline with verified badge, trigger pills, sticky subscribe card with price/metadata/install command, "What this is" section with distinction grid (this vs. generic AI), conversation demo, files list with load_for triggers, "How it works" 3-step section, subscribe modal → Stripe Checkout
- Post-checkout success (`/mindsets/success`) — install command with token, Claude Desktop config JSON block, copy buttons
- Public creator profile (`/creators/[handle]`) — avatar, name, headline, verified badge, bio, credentials, work samples, published mindsets grid

**Shared components (3):**
- `mindset-card.tsx` — Card with creator, verified badge, domain badge, description, price, last updated
- `subscribe-modal.tsx` — Modal with mindset info, email input, subscribe button → API → Stripe Checkout
- `creator-sidebar.tsx` — Nav sidebar for creator portal (overview, mindsets, profile, verification, payouts)

**Design system:**
- Light theme (marketplace index, creator portal): parchment `#f5f2eb`, forest green `#1a4a2e`, Playfair Display + IBM Plex Mono
- Dark theme (mindset detail, success): `#0d0c09` bg, warm gold `#c8a86a` accent, `#e8e4da` text
- Tailwind config extended with dark theme color tokens (`dk-*`, `warm`, `kh-green`)

**Files created (35):**
```
src/db/migrations.ts                     — Idempotent migration runner
src/mindsets/types.ts                    — TypeScript interfaces
src/mindsets/paths.ts                    — ~/.know-help/ path resolution
src/mindsets/cache.ts                    — Local SQLite cache
src/mindsets/validation.ts               — Manifest + file validation
src/mindsets/storage.ts                  — S3/local file storage
src/mindsets/routes.ts                   — Express API router (~600 lines)
src/mindsets/checkout.ts                 — Stripe subscription checkout
src/mindsets/auto-sync.ts               — Startup sync logic
src/mindsets/watcher.ts                  — Chokidar file watcher
src/mindsets/installer.ts               — Local CLI mindset installation
src/mindsets/publisher.ts               — CLI publish logic
src/tools/search-mindset.ts             — MCP tool
src/tools/load-mindset.ts               — MCP tool
src/tools/sync-mindsets.ts              — MCP tool
src/tools/check-subscriptions.ts        — MCP tool
web/src/components/mindset-card.tsx      — Reusable card component
web/src/components/subscribe-modal.tsx   — Checkout modal
web/src/components/creator-sidebar.tsx   — Creator portal nav
web/src/app/mindsets/page.tsx            — Marketplace index
web/src/app/mindsets/[slug]/page.tsx     — Mindset detail page
web/src/app/mindsets/success/page.tsx    — Post-checkout success
web/src/app/creator/layout.tsx           — Creator sidebar layout
web/src/app/creator/page.tsx             — Creator dashboard / apply
web/src/app/creator/mindsets/page.tsx    — My Mindsets list
web/src/app/creator/mindsets/new/page.tsx — New mindset wizard
web/src/app/creator/mindsets/[id]/page.tsx — Mindset editor
web/src/app/creator/profile/page.tsx     — Profile settings
web/src/app/creator/verify/page.tsx      — Verification submission
web/src/app/creator/payouts/page.tsx     — Earnings + payouts
web/src/app/creators/[handle]/page.tsx   — Public creator profile
```

**Files modified (7):**
```
src/db/database.ts                       — Added runMigrations() call
src/index.ts                             — Registered 4 new tools, auto-sync, watcher (11 tools total, v2.0.0)
src/waitlist/server.ts                   — Mounted /api/mindsets routes
src/payments/webhooks.ts                 — Added mindset subscription webhook routing
src/utils/triggers.ts                    — Enhanced CLAUDE.md with Mindsets section
src/marketplace/cli.ts                   — Added all Mindset CLI commands
web/tailwind.config.ts                   — Added dark theme color tokens
```

**Tested:**
- Backend TypeScript compiles with zero errors (0 errors, ~50 source files)
- 66/66 self-tests pass (MCP tools, path validation, slugify, search accuracy, structure, SEO)
- Next.js frontend builds successfully — all 24 pages compile and optimize
- All pages under 8KB individual JS, ~87-100KB first load shared
- 10 new pages: /mindsets, /mindsets/[slug], /mindsets/success, /creator (+ 5 sub-pages), /creators/[handle]

**Skipped:**
- End-to-end Stripe subscription purchase (requires real STRIPE_SECRET_KEY with Connect)
- Mindset sync integration test (requires running know.help API)
- Chokidar watcher integration test (requires ~/.know-help/ directory)

**Architecture decisions:**
1. Separate tables — Mindsets get their own tables (not reusing packs/purchases)
2. New MCP tools — 4 new alongside existing 7 (no modification to existing tools)
3. Local cache DB — `~/.know-help/cache.db` for offline operation
4. `/api/mindsets` namespace — Single Express router, one mount point
5. Stripe Connect `application_fee_percent: 30` — 70/30 creator/platform split
6. Dark theme for mindset detail pages — matches reference designs
7. Additive CLI — New commands added to existing `know` binary switch statement
