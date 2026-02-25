# MCP Registry Submission Guide

## Overview

Submit know.help to the official MCP Registry at https://registry.modelcontextprotocol.io
so it's discoverable by every MCP client.

---

## Step 1: Add `mcpName` to package.json

```json
{
  "name": "know-help",
  "version": "1.0.0",
  "mcpName": "io.github.kuleana808/know-help",
  "description": "Context engineering MCP server — persistent, trigger-based knowledge base for Claude Desktop",
  "repository": {
    "type": "git",
    "url": "https://github.com/Kuleana808/Know-Help.git"
  }
}
```

## Step 2: Publish to npm

```bash
npm adduser          # login to npm
npm publish --access public
```

If the package name `know-help` is taken, use `@kuleana808/know-help`:

```bash
# In package.json: "name": "@kuleana808/know-help"
npm publish --access public
```

## Step 3: Install mcp-publisher CLI

```bash
# macOS/Linux
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

# Or via Homebrew
brew install mcp-publisher
```

## Step 4: Init server.json

```bash
mcp-publisher init
```

Then edit the generated `server.json`:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.kuleana808/know-help",
  "description": "Context engineering MCP server. Gives Claude Desktop a persistent, trigger-based knowledge base. Your AI finally knows who you are.",
  "repository": {
    "url": "https://github.com/Kuleana808/Know-Help.git",
    "source": "github"
  },
  "version": "1.0.0",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "know-help",
      "version": "1.0.0",
      "transport": {
        "type": "stdio"
      }
    }
  ]
}
```

## Step 5: Authenticate with GitHub

```bash
mcp-publisher login github
```

Follow the device flow prompt — opens browser to authorize.

## Step 6: Publish to registry

```bash
mcp-publisher publish
```

## Step 7: Verify

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.kuleana808/know-help"
```

---

## Also submit to community directories

### PulseMCP (8600+ servers listed)
- URL: https://www.pulsemcp.com
- Submit via their "Add Server" form

### Smithery
- URL: https://smithery.ai
- Submit via their directory

### modelcontextprotocol/servers (GitHub)
- URL: https://github.com/modelcontextprotocol/servers
- Open a PR to add know.help to the community servers list

---

## Why this matters (GEO signal)

The MCP Registry is the canonical feed that AI models and MCP clients index from.
Being listed there means:
- Claude Desktop may surface know.help in tool suggestions
- AI models answering "what MCP servers exist for X" will cite know.help
- Every downstream directory (PulseMCP, Smithery, etc.) pulls from the registry
