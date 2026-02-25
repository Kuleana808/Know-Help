# Show HN Draft

## Title (80 char limit)

```
Show HN: know.help – Context engineering for Claude Desktop via MCP
```

**Alternate titles (pick the one that feels right):**

```
Show HN: know.help – Give Claude Desktop a persistent knowledge base about you
Show HN: know.help – An MCP server that makes Claude remember who you are
```

---

## Post Text

Every time I open a new Claude conversation, I start over. I re-explain who I am, what my company does, who I'm emailing, how I like to communicate. I'm a founder running three ventures — I context-switch constantly, and my AI has no memory of any of it.

So I built know.help: an open-source MCP server that gives Claude Desktop a persistent, trigger-based knowledge base.

**How it works:**

You write modular markdown files organized by domain — identity, network, ventures, sales methodology, communication style. Each file has trigger keywords in its header. When you mention a person's name, their relationship file loads automatically. Start a sales conversation, and your methodology appears. No prompting required.

The architecture uses three-level progressive disclosure:
- Level 1: A lightweight routing index (always loaded, <100 lines)
- Level 2: Domain modules (load on keyword match, 40-100 lines each)
- Level 3: Specific data files (load on explicit trigger)

This prevents context pollution — your AI gets exactly what it needs, not everything you've ever written.

**Technical details:**
- TypeScript MCP server using Anthropic's Model Context Protocol SDK
- 7 tools: search, load, list, log activity, update network, log decisions, log failures
- Markdown for narrative content, JSONL for append-only data (contacts, decisions)
- Path traversal protection, auto-generated CLAUDE.md routing index
- Zero external dependencies beyond the MCP SDK

**What I'm calling "context engineering":**

The AI industry spent two years on prompt engineering — optimizing how you ask. Context engineering is the next layer: optimizing what the AI knows before you ask. A simple question with excellent context produces better output than a perfect prompt with no context.

The difference between "draft an email to Sarah about the Series A" failing vs. succeeding isn't the prompt — it's whether your AI knows who Sarah is, what the Series A terms look like, and how you write emails.

I wrote a longer piece on this: https://know.help/blog/what-is-context-engineering

**What's next:**
- Layer 2: autonomous crawlers that monitor X, Reddit, LinkedIn, TikTok, and RSS to keep your knowledge base current without manual updates
- Knowledge pack marketplace: pre-built context files by domain (sales playbooks, content strategy, etc.)

GitHub: https://github.com/Kuleana808/Know-Help
Site: https://know.help

Would love feedback from anyone building with MCP or thinking about AI context management.

---

## Submission Notes

**Best time to post:** Tuesday-Thursday, 8-9am ET (11am-1pm ET for peak visibility)

**Key HN principles this follows:**
1. Leads with the problem (personal pain point)
2. Shows the technical substance (architecture, tools, format decisions)
3. Introduces a new concept ("context engineering") without being preachy
4. Links to code (GitHub) — HN respects open source
5. Asks for feedback (engagement hook)
6. No marketing language, no superlatives

**Likely HN questions to prepare for:**
- "How is this different from just using a system prompt?" → System prompts are static and limited to ~8K tokens. know.help is dynamic, persistent, and loads only relevant context.
- "Why not RAG?" → RAG is probabilistic and needs embedding infrastructure. Trigger-based loading is deterministic, transparent, and uses plain markdown files. You see exactly what loads and why.
- "Why JSONL instead of SQLite?" → Append-only by design. Agents can add lines but can't overwrite. Prevents accidental data destruction. Each line is self-contained valid JSON.
- "Does this work with other models?" → MCP is Anthropic's protocol, currently supported by Claude Desktop. As other clients adopt MCP, know.help will work with them too.
- "How is this different from Mem / Notion AI / ChatGPT memory?" → These are passive or fragmented. know.help is structured, trigger-based, file-level control, you own the data, and it's designed for MCP-native loading.

---

## r/ClaudeAI Cross-Post (shorter version)

**Title:** I built an MCP server that gives Claude a persistent knowledge base about you — open source

**Body:**

I kept re-explaining everything to Claude. My background, my company, the person I'm emailing, how I write. Every session, from scratch.

So I built know.help — an open-source MCP server that gives Claude Desktop a persistent, trigger-based knowledge base.

You write markdown files with trigger keywords. Mention a person → their relationship file loads. Talk about sales → your methodology appears. No manual prompting.

7 MCP tools, three-level progressive disclosure architecture, markdown + JSONL for append-only data integrity.

I'm calling the practice "context engineering" — optimizing what your AI knows, not just how you ask.

GitHub: https://github.com/Kuleana808/Know-Help

Full writeup on context engineering: https://know.help/blog/what-is-context-engineering

---

## r/LocalLLaMA Cross-Post

**Title:** Context engineering > prompt engineering: an MCP server for persistent AI memory (open source)

**Body:**

Built an open-source TypeScript MCP server called know.help that gives Claude Desktop a persistent knowledge base.

Architecture:
- Modular markdown files with YAML front-matter trigger keywords
- Three-level progressive disclosure (routing index → domain modules → data files)
- JSONL for append-only data (network contacts, decision logs, failure logs)
- Auto-generated CLAUDE.md routing index
- 7 tools exposed via MCP

The core idea: instead of optimizing prompts, optimize context. Load the right information before the question is asked.

Currently Claude Desktop only, but the MCP protocol is open and being adopted by other clients.

GitHub: https://github.com/Kuleana808/Know-Help

Wrote up the concept here: https://know.help/blog/what-is-context-engineering
