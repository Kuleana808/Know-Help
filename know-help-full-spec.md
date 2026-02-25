# know.help — Full Product Spec v0.2

**Domain:** know.help
**Status:** Planning
**Updated:** February 2026

---

## What it is

A personal AI OS with two layers:

**Layer 1 — Static Knowledge Base (MCP Server)**
Modular markdown files that load into AI context on trigger. You write it once, your AI uses it everywhere.

**Layer 2 — Living Intelligence (The Killer Feature)**
An autonomous crawler that monitors X, TikTok, Reddit, LinkedIn, and RSS across your ventures and custom topics — continuously writing and updating your .md files so your knowledge base stays current without you touching it.

---

## Layer 1: MCP Server (as previously specced)

### File Structure
```
/knowledge
  CLAUDE.md                  <- index, always loaded
  /core
    identity.md
    team.md
  /network
    [person-name].md
  /venture
    [company-name].md
  /sales
    methodology.md
    objections.md
    icp.md
  /platform
    linkedin.md
    twitter.md
    instagram.md
  /planning
    goals.md
    pipeline.md
  /communication
    style.md
    templates.md
  /log
    [YYYY-MM-DD].md
```

### MCP Tools
- `search_knowledge(query)` — scans trigger headers, returns matching files
- `load_context(filepath)` — returns full file content
- `log_activity(entry)` — appends to today's log
- `update_network(name, notes)` — appends to relationship file
- `list_knowledge()` — returns full file tree

---

## Architectural Principles (from context engineering research)

### Three-Level Progressive Disclosure
Never load everything at once. The model has a U-shaped attention curve — it recalls the beginning and end of context strongly, but the middle blurs. know.help enforces three levels:

- **Level 1 — CLAUDE.md (always loaded):** Lightweight routing index. Tells the model which files exist and what triggers them. Under 100 lines.
- **Level 2 — Module files (load per domain):** Folder-level instruction files for each domain (network, ventures, sales, etc). 40-100 lines each. Load only when that domain is relevant.
- **Level 3 — Data files (load on trigger):** The actual .md and .jsonl files with relationship history, venture details, etc. Load only when a specific trigger keyword is detected.

Maximum two hops from routing to data. Never load Level 3 without first confirming Level 2 relevance.

### File Format Decisions
Format is not aesthetic — it's architectural:

- **JSONL for logs and network files:** Append-only by design. Agents can add lines but cannot overwrite the file. Prevents accidental data destruction. Stream-friendly — model reads line by line without parsing the entire file. Every line is self-contained valid JSON. First line is always a schema declaration: `{"_schema": "contact", "_version": "1.0", "_description": "..."}`
- **Markdown for narrative files:** LLMs read it natively. Renders everywhere. Clean diffs in Git. Use for voice guides, venture context, sales methodology.
- **YAML for configuration:** Handles hierarchical data cleanly, supports comments, human and machine readable.

### Critical Rules for File Design
- **Front-load the most important content.** Voice guides, critical rules, and distinctive patterns go in the first 100 lines. The U-shaped attention curve means content buried in the middle of a long file will be ignored.
- **Keep module files under 100 lines.** Longer than that and you're loading too much. Split into sub-files instead.
- **Append-only is non-negotiable for logs.** Use JSONL. Mark deletions as `"status": "archived"` — never actually delete lines.
- **One source of truth.** Module files reference data files, never duplicate content from them.

### Episodic Memory vs. Facts
know.help stores both facts and judgment:

- **Facts:** What happened, who said what, current status
- **Judgment:** Key decisions with reasoning and alternatives considered, failures with root cause and prevention steps, what mattered and why

A `decisions.jsonl` and `failures.jsonl` file per venture encodes pattern recognition that informs future AI behavior — not just historical record.

---

## Layer 2: Living Intelligence

### Overview
An autonomous background agent that runs on a schedule, monitors five source types, extracts signal, and writes/updates .md files in your knowledge base. No human approval required. Fully automated.

### Architecture

```
Scheduler (cron)
  → Source Crawlers (per source type)
    → Signal Extractor (LLM)
      → File Writer
        → Knowledge Base (.md files)
          → MCP Server (reads updated files)
            → Your AI (context loads on trigger)
```

### Knowledge Config File
Each user maintains a `knowledge.config.json` that defines what to watch:

```json
{
  "ventures": [
    {
      "name": "Vinovest",
      "file": "venture/vinovest.md",
      "topics": ["wine investment", "alternative assets", "DTC fintech", "wine market"],
      "competitors": ["Vint", "Cult Wines", "Bordeaux Index"],
      "key_people": ["Anthony Zhang"]
    },
    {
      "name": "Stacked",
      "file": "venture/stacked.md",
      "topics": ["vibe coding", "indie hackers", "no-code launch", "cursor lovable bolt"],
      "competitors": [],
      "key_people": []
    },
    {
      "name": "know.help",
      "file": "venture/knowhelp.md",
      "topics": ["MCP server", "AI memory", "personal AI OS", "Claude Desktop"],
      "competitors": ["Mem", "Notion AI", "ChatGPT memory"],
      "key_people": []
    }
  ],
  "custom_topics": [
    {
      "name": "AI Tooling",
      "file": "intelligence/ai-tooling.md",
      "topics": ["MCP protocol", "AI agents", "LLM tooling", "Claude API"]
    },
    {
      "name": "Hawaii Startups",
      "file": "intelligence/hawaii-startups.md",
      "topics": ["Hawaii tech", "Honolulu startup", "Hawaii founders"]
    }
  ],
  "crawl_schedule": "every_6_hours",
  "sources": ["twitter", "tiktok", "reddit", "linkedin", "rss"],
  "rss_feeds": [
    "https://techcrunch.com/feed/",
    "https://www.theinformation.com/feed"
  ]
}
```

### Source Crawlers

**X / Twitter**
- Search API for each topic keyword
- Filter: min 50 engagements OR from followed accounts
- Capture: tweet text, author, engagement, URL, timestamp

**TikTok**
- TikTok Research API (or scraper fallback)
- Search by hashtag and keyword
- Filter: min 1K views
- Capture: transcript (via Whisper), creator, view count, URL

**Reddit**
- Reddit API (PRAW)
- Monitor relevant subreddits per topic
- Filter: min 50 upvotes OR rising
- Capture: post title, body, top 3 comments, score, URL

**LinkedIn**
- LinkedIn scraper (Apify actor or similar)
- Search posts by keyword
- Filter: min 50 reactions
- Capture: post text, author, engagement, URL

**RSS / Newsletters**
- User-defined feed list in config
- Parse new entries since last crawl
- Capture: title, summary, full text, source, URL

### Signal Extraction (LLM Layer)

Each batch of raw crawl data is passed to Claude with a prompt:

```
You are maintaining a personal knowledge base for [user].

Here is raw content crawled from [source] about [topic/venture].

Your job:
1. Identify genuinely new, useful signal — trends, competitor moves, 
   market shifts, relevant people, tactical ideas
2. Discard: noise, repetitive takes, low-quality content
3. For each signal item, determine:
   - Which .md file it belongs in
   - Whether to APPEND to existing content or UPDATE a specific section
   - A concise summary (2-4 sentences max) with source URL

Return JSON only.
```

Output schema:
```json
[
  {
    "file": "venture/vinovest.md",
    "action": "append",
    "section": "## Market Intelligence",
    "content": "Feb 2026: Cult Wines launched a secondary market feature...",
    "source": "https://...",
    "confidence": 0.85
  }
]
```

Only items with `confidence > 0.7` are written automatically. Below that, items are logged to `log/skipped.md` for occasional review.

### File Writing

The file writer receives the JSON output and:
- Opens the target .md file
- Finds the correct section (or creates it if missing)
- Appends or updates content with a datestamp
- Preserves all existing content
- Adds a `Last updated:` timestamp to the file header

### New File Creation

If signal is strong enough and no relevant file exists, the writer creates a new one:
- Automatically adds it to CLAUDE.md index
- Sets Load for: triggers based on the topic keywords
- Notifies user via a `log/new-files.md` entry

### Crawl Schedule
- Default: every 6 hours
- Configurable per source or per topic
- Rate limits respected per platform API

---

## Product Tiers (Post-MVP)

**Free / OSS**
- MCP server only
- Manual knowledge base updates
- Self-hosted

**Pro ($19/mo)**
- Living Intelligence layer
- All 5 sources
- Up to 5 ventures + 10 custom topics
- Hosted (no self-hosting required)
- Web UI for config and file review

**Team ($49/mo)**
- Everything in Pro
- Shared knowledge bases across team members
- Role-based access (who can read/write which files)

---

## MVP Build Order

1. MCP server (Layer 1) — static knowledge base, all tools
2. know.help landing page — waitlist
3. X/Reddit crawlers + signal extractor (Layer 2, two sources)
4. File writer + CLAUDE.md auto-updater
5. TikTok + LinkedIn + RSS crawlers
6. knowledge.config.json UI (web)
7. Hosted version

---

## Competitive Moat

No existing tool does all of this:
- Mem: passive search, no trigger loading, no crawling
- Notion AI: works within Notion only, no MCP, no crawling
- ChatGPT memory: fragmented facts, no structure, no external ingestion
- Perplexity: search on demand, not persistent, not personalized

know.help is the only system where your AI's knowledge about you and your world **updates itself** — continuously, across every source that matters, organized exactly the way you think.

---

## Open Questions

- TikTok API access: Research API requires approval. Apify fallback for MVP?
- LinkedIn: No official post search API. Apify actor most reliable option.
- Pricing: Validate free OSS first, then introduce Pro tier at first 100 waitlist signups
- Mobile: Config editing on mobile (low priority, post-MVP)
