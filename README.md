# know.help

Personal AI OS — an MCP server that gives Claude Desktop persistent, structured memory about you, your ventures, your network, and your work.

## Architecture

### Layer 1: MCP Server (Static Knowledge Base)
Modular markdown and JSONL files with trigger-based context loading. Your AI loads the right files at the right time based on conversation keywords.

### Layer 2: Living Intelligence
Scheduled crawlers (Twitter/X, Reddit) that monitor your ventures, extract signals via Claude API, and write updates back to your knowledge files automatically.

### Layer 3: Knowledge Marketplace
Install pre-built knowledge packs from creators. Sales methodologies, content voice guides, planning frameworks — one command to install.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run MCP server
npm start

# Run self-test
npm run self-test
```

## MCP Tools (7 total)

| Tool | Description |
|------|-------------|
| `search_knowledge(query)` | Search trigger keywords across all knowledge files |
| `load_context(filepath)` | Load a specific knowledge file (path-traversal protected) |
| `list_knowledge()` | List all files with triggers and schemas |
| `log_activity(entry)` | Append timestamped entry to daily activity log |
| `update_network(name, notes)` | Append interaction to a person's network file |
| `append_decision(venture, decision, reasoning, alternatives)` | Log a decision with reasoning |
| `append_failure(venture, what, root_cause, prevention)` | Log a failure with root cause analysis |

## Claude Desktop Configuration

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "know-help": {
      "command": "node",
      "args": ["/absolute/path/to/know-help/dist/index.js"]
    }
  }
}
```

## Knowledge Base Structure

```
knowledge/
  core/identity.md        — Who you are
  core/team.md            — Your team and collaborators
  network/*.jsonl          — Relationship logs (append-only)
  venture/*.md             — Your ventures and businesses
  sales/methodology.md     — Sales process
  sales/objections.md      — Objection handling
  sales/icp.md             — Ideal customer profile
  platform/linkedin.md     — LinkedIn voice and strategy
  platform/twitter.md      — Twitter/X voice and strategy
  planning/goals.md        — Goals and OKRs
  planning/pipeline.md     — Deal pipeline
  communication/style.md   — Writing style rules
  communication/templates.md — Message templates
  log/decisions.jsonl      — Decision log (append-only)
  log/failures.jsonl       — Failure log (append-only)
  log/YYYY-MM-DD.md        — Daily activity logs
```

## File Format Rules

- Every `.md` file starts with trigger keywords: `Load for: keyword1, keyword2`
- JSONL files are **append-only** — no code path can overwrite them
- CLAUDE.md is auto-generated and stays under 100 lines
- Network files use JSONL with schema declarations

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

### Pack Format

```
my-pack/
  pack.json       — Metadata and file manifest
  knowledge/      — Files to install
  README.md       — Documentation
  PREVIEW.md      — What buyers see before purchasing
```

### Seed Packs

| Pack | Price | Description |
|------|-------|-------------|
| founder-core | Free | Identity, venture, and planning templates |
| saas-sales-starter | $19 | Sales methodology, ICP, objection handling |
| creator-voice-pack | $14 | LinkedIn, Twitter, newsletter voice guides |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For intelligence layer | Claude API key for signal extraction |
| `TWITTER_BEARER_TOKEN` | For Twitter crawling | Twitter API v2 bearer token |
| `PORT` | No (default: 3000) | Waitlist server port |
| `DATA_DIR` | No (default: ./data) | Persistent storage for waitlist |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |

## License

MIT
