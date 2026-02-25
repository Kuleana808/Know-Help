# know.help — Context Engineering for AI

**know.help is an MCP server that gives Claude a persistent, trigger-based knowledge base — plus a marketplace of installable Mindsets from verified professionals.**

> Context engineering is the discipline of architecting the right information into AI context at the right time. know.help is the first tool purpose-built for it.

[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

---

## What It Does

Every time you open a new Claude conversation, you start over. Your AI doesn't know your name, your company, your goals, or your relationships.

know.help fixes this with two systems:

### 1. Personal Knowledge Base
Modular markdown and JSONL files with trigger-based context loading. Mention a person's name and their relationship history loads. Start a sales conversation and your methodology appears. No manual prompting.

### 2. Mindset Marketplace
Subscribe to Mindsets published by verified professionals. A Mindset is a living body of expert judgment — taste filters, decision criteria, red lines — installable via MCP. When you ask Claude "is this logo working?" and have a Brand Design Mindset installed, you get an actual answer, not a hedge.

## Quick Start

### Prerequisites

- [Claude Desktop](https://claude.ai/download) or [Cursor](https://cursor.sh)
- Node.js 18+

### Installation

```bash
npx know-help@latest serve
```

Or install globally:

```bash
npm install -g know-help
know serve
```

### Configure Claude Desktop

Add to your MCP configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "know-help": {
      "command": "npx",
      "args": ["know-help@latest", "serve"],
      "env": {
        "KNOW_HELP_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Initialize Your Knowledge Base

On first run, know.help creates `~/.know-help/` with template files:

```
~/.know-help/
  core/identity.md          # Who you are
  core/team.md              # Your team
  network/                  # Key relationships (JSONL)
  venture/                  # Your businesses and projects
  sales/                    # Sales methodology and pipeline
  platform/                 # LinkedIn, Twitter voice
  planning/                 # OKRs and milestones
  communication/            # Style and templates
  log/                      # Activity and decision logs
  mindsets/                 # Installed Mindsets
```

Each file uses a trigger header:

```markdown
---
Load for: sales, methodology, selling, process, close
Last updated: 2026-02-25
---

# Sales Methodology

Your methodology content here...
```

When Claude detects those trigger words, the file loads automatically.

## MCP Tools

know.help exposes 11 tools to Claude via MCP:

### Core Knowledge Tools

| Tool | Description |
|------|-------------|
| `search_knowledge(query)` | Scan trigger keywords, return matching files with relevance scores |
| `load_context(filepath)` | Return full content of a knowledge file |
| `list_knowledge()` | Return the complete file tree with metadata |
| `log_activity(entry)` | Append timestamped entry to daily activity log |
| `update_network(name, notes)` | Add/update a person in your network (append-only JSONL) |
| `append_decision(venture, decision, reasoning, alternatives)` | Log a decision with full context |
| `append_failure(venture, what, root_cause, prevention)` | Log a failure with root cause analysis |

### Mindset Tools

| Tool | Description |
|------|-------------|
| `search_mindset(query)` | Search installed Mindsets by trigger keywords and topics |
| `load_mindset(creator_slug, topic?)` | Load files from an installed Mindset |
| `sync_mindsets()` | Download updates for all installed Mindsets |
| `check_subscriptions()` | Validate subscription status for installed Mindsets |

## Mindset Marketplace

### Installing a Mindset

```bash
# Subscribe at know.help/mindsets, then:
know install maya-reyes --token YOUR_INSTALL_TOKEN

# List installed Mindsets
know list

# Check subscription status
know status

# Sync updates
know sync

# Remove a Mindset
know remove maya-reyes
```

After installation, Mindset files merge into `~/.know-help/mindsets/` and activate automatically based on conversation topics.

### Publishing a Mindset

Verified professionals can publish their judgment as a subscription Mindset:

```bash
# Scaffold a new Mindset
know publish --init

# Publish to the marketplace
know publish ./my-mindset

# Dry-run (validate without publishing)
know publish ./my-mindset --dry-run
```

**Creator workflow:**
1. Apply at [know.help/creator](https://know.help/creator)
2. Get verified (credentials, portfolio, work samples)
3. Build your Mindset (5+ judgment files with trigger headers)
4. Publish — subscribers get automatic updates
5. Earn 70% of every subscription

### Mindset Categories

- Brand Design
- Growth Marketing
- Sales
- Operations
- Content
- Engineering
- Finance
- Legal
- Product

Browse all Mindsets at [know.help/mindsets](https://know.help/mindsets).

## Architecture

### Three-Level Progressive Disclosure

| Level | What | When | Size |
|-------|------|------|------|
| **Level 1** | `CLAUDE.md` routing index | Always loaded | <100 lines |
| **Level 2** | Module files (per domain) | On keyword match | 40-100 lines each |
| **Level 3** | Data files (specific entries) | On specific trigger | Variable |

This prevents context pollution. Your AI gets exactly the information it needs.

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Claude Desktop / Cursor                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  MCP Protocol                                     │  │
│  │  11 tools: search, load, list, log, network,     │  │
│  │  decisions, failures, search_mindset, load_mindset│  │
│  │  sync_mindsets, check_subscriptions               │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  ~/.know-help/                                          │
│  ├── core/         Personal identity + context          │
│  ├── network/      Relationships (JSONL)                │
│  ├── venture/      Projects + companies                 │
│  ├── sales/        Methodology + pipeline               │
│  ├── mindsets/     Installed expert Mindsets             │
│  │   ├── maya-reyes/    Brand Design Judgment           │
│  │   └── james-kirk/    B2B Growth Operator             │
│  └── log/          Activity + decision logs             │
├─────────────────────────────────────────────────────────┤
│  know.help API                                          │
│  ├── Mindset Publishing    (creator portal)             │
│  ├── Subscription Checkout (Stripe)                     │
│  ├── Sync Protocol         (version check + download)   │
│  └── Living Intelligence   (crawlers + signal extraction│
└─────────────────────────────────────────────────────────┘
```

## CLI Commands

```bash
know serve              # Start MCP server
know install <target>   # Install a Mindset or local pack
know list               # List installed Mindsets
know sync [slug]        # Sync Mindset updates
know status             # Subscription and sync status
know remove <slug>      # Remove an installed Mindset
know publish [dir]      # Publish a Mindset
know publish --init     # Scaffold a new Mindset
know login              # Authenticate with know.help
know logout             # Clear credentials
```

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

| Variable | Required | Description |
|----------|----------|-------------|
| `KNOW_HELP_TOKEN` | For sync | Auth token for Mindset sync |
| `STRIPE_SECRET_KEY` | For payments | Stripe API key |
| `RESEND_API_KEY` | For emails | Resend email API key |
| `ANTHROPIC_API_KEY` | For intelligence | Claude API key for signal extraction |
| `JWT_SECRET` | For auth | Random 64+ char secret |
| `ADMIN_KEY` | For admin | Secret key for admin endpoints |

## Development

```bash
# Install dependencies
npm install
cd web && npm install

# Build
npm run build
npm run build:web

# Run tests
npm test

# Self-test (exercises all MCP tools)
npm run self-test

# Dev mode
npm run dev
npm run dev:web
```

## Contributing

know.help is open source. Contributions welcome.

## License

MIT

---

**Built for people who use AI seriously.** Your AI should already know who you are.

[know.help](https://know.help) · [Mindsets](https://know.help/mindsets) · [Blog](https://know.help/blog) · [hello@know.help](mailto:hello@know.help)
