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
