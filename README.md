# know.help — Context Engineering for AI

**know.help is an MCP server that gives Claude Desktop a persistent, trigger-based knowledge base.** Your AI finally knows who you are, what you're building, and who matters — without re-explaining every session.

> Context engineering is the discipline of architecting the right information into AI context at the right time. know.help is the first tool purpose-built for it.

[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

---

## What It Does

Every time you open a new Claude conversation, you start over. Your AI doesn't know your name, your company, your goals, or your relationships. You re-explain everything, every time.

know.help fixes this. It's a personal knowledge base that connects to Claude Desktop via [MCP (Model Context Protocol)](https://modelcontextprotocol.io) and automatically loads the right context based on what you're talking about.

**How it works:**

1. **You write your knowledge once** — modular markdown files organized by domain (identity, network, ventures, sales, communication)
2. **Trigger keywords auto-load context** — mention a person's name, and their relationship history loads. Start a sales conversation, and your methodology appears. No manual prompting.
3. **Your AI starts every conversation informed** — less explaining, better output, feels like talking to someone who's been paying attention.

## Architecture

### Layer 1: MCP Server (Static Knowledge Base)
Modular markdown and JSONL files with trigger-based context loading. Your AI loads the right files at the right time based on conversation keywords.

### Layer 2: Living Intelligence
Scheduled crawlers (Twitter/X, Reddit) that monitor your ventures, extract signals via Claude API, and write updates back to your knowledge files automatically.

### Layer 3: Knowledge Marketplace
Install pre-built knowledge packs from creators. Sales methodologies, content voice guides, planning frameworks — one command to install.

## Quick Start

### Prerequisites

- [Claude Desktop](https://claude.ai/download) installed
- Node.js 18+

### Installation

```bash
# Clone the repository
git clone https://github.com/Kuleana808/Know-Help.git
cd Know-Help

# Install dependencies
npm install

# Build the MCP server
npm run build
```

### Configure Claude Desktop

Add know.help to your Claude Desktop MCP configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "know-help": {
      "command": "node",
      "args": ["/path/to/Know-Help/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The know.help MCP server will now be available in every conversation.

### Initialize Your Knowledge Base

The first time you run know.help, it creates a `knowledge/` directory with template files:

```
knowledge/
  core/identity.md          # Who you are
  core/team.md              # Your team and collaborators
  network/                  # Key relationships (JSONL)
  venture/                  # Your businesses and projects
  sales/methodology.md      # Sales approach and playbook
  sales/objections.md       # Objection handling
  sales/icp.md              # Ideal customer profiles
  platform/linkedin.md      # LinkedIn voice and strategy
  platform/twitter.md       # X/Twitter voice and strategy
  planning/goals.md         # OKRs and milestones
  planning/pipeline.md      # Active deals and opportunities
  communication/style.md    # Your communication style
  communication/templates.md # Message templates
  log/                      # Daily activity and decision logs
```

Edit these files with your real information. Each file uses a simple trigger header:

```markdown
---
Load for: sales, methodology, selling, process, close
Last updated: 2026-02-25
---

# Sales Methodology

Your methodology content here...
```

When Claude detects any of those trigger words in your conversation, the file loads automatically.

## Architecture: Context Engineering in Practice

know.help implements **three-level progressive disclosure** — a context engineering pattern that respects how LLMs actually process information:

| Level | What | When | Size |
|-------|------|------|------|
| **Level 1** | `CLAUDE.md` routing index | Always loaded | <100 lines |
| **Level 2** | Module files (per domain) | On keyword match | 40-100 lines each |
| **Level 3** | Data files (specific entries) | On specific trigger | Variable |

This architecture prevents context pollution. Your AI gets exactly the information it needs — no more, no less.

### Why Not Just Use a System Prompt?

System prompts are limited to ~8K tokens and static. know.help provides:

- **Dynamic loading** — only relevant context enters the conversation
- **Structured knowledge** — organized by domain, not crammed into one blob
- **Persistent memory** — survives across sessions, grows over time
- **Trigger-based precision** — the right context loads at the right time

## MCP Tools

know.help exposes 7 tools to Claude via MCP:

| Tool | Description |
|------|-------------|
| `search_knowledge(query)` | Scan trigger keywords, return matching files with relevance scores |
| `load_context(filepath)` | Return full content of a knowledge file |
| `list_knowledge()` | Return the complete file tree with metadata |
| `log_activity(entry)` | Append timestamped entry to daily activity log |
| `update_network(name, notes)` | Add/update a person in your network (append-only JSONL) |
| `append_decision(venture, decision, reasoning, alternatives)` | Log a decision with full context |
| `append_failure(venture, what, root_cause, prevention)` | Log a failure with root cause analysis |

## File Format Design

Formats are architectural decisions, not aesthetic ones:

- **Markdown (.md)** — for narrative content (identity, methodology, voice guides). LLMs read it natively, renders everywhere, clean git diffs.
- **JSONL (.jsonl)** — for append-only data (contacts, decisions, failures). One valid JSON object per line. Agents can add lines but never overwrite. Prevents accidental data destruction.

## Waitlist API

```bash
# Start the waitlist server
npm run start:waitlist

# Endpoints
POST /waitlist          — Submit email signup
GET  /waitlist/count    — Get total signups
GET  /health            — Health check
```

### Docker Deployment

```bash
docker build -t know-help-waitlist .
docker run -p 3000:3000 -v waitlist-data:/data know-help-waitlist
```

## Living Intelligence

```bash
# Set environment variables
export ANTHROPIC_API_KEY=your-key
export TWITTER_BEARER_TOKEN=your-token

# Start the crawler
npm run start:crawler
```

Configure ventures and sources in `knowledge.config.json`.

## Knowledge Packs

```bash
# Install a pack from local path
know install ./path-to-pack

# List available packs
know list-packs

# List installed packs
know installed

# Create a new pack
know create-pack
```

### Seed Packs

| Pack | Price | Description |
|------|-------|-------------|
| founder-core | Free | Identity, venture, and planning templates |
| saas-sales-starter | $19 | Sales methodology, ICP, objection handling |
| creator-voice-pack | $14 | LinkedIn, Twitter, newsletter voice guides |

## Who It's For

- **Founders & operators** — context-switch constantly; know.help keeps your AI current across deals, relationships, and initiatives
- **Sales professionals** — every contact, conversation, and objection instantly available
- **Content creators** — your AI knows your distinct voice on every platform
- **Developers** — your AI knows your stack, architecture, and team — not just the current file

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For intelligence layer | Claude API key for signal extraction |
| `TWITTER_BEARER_TOKEN` | For Twitter crawling | Twitter API v2 bearer token |
| `PORT` | No (default: 3000) | Waitlist server port |
| `DATA_DIR` | No (default: ./data) | Persistent storage for waitlist |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |

## Contributing

know.help is open source. Contributions welcome.

```bash
# Development
npm run dev

# Build
npm run build

# Run tests
npm test

# Self-test
npm run self-test
```

## License

MIT

---

**Built for people who use AI seriously.** Your AI should already know who you are.

[know.help](https://know.help) · [Blog](https://know.help/blog) · [hello@know.help](mailto:hello@know.help)
