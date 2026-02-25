#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ensureKnowledgeDir } from "./utils/paths";
import { writeClaudeMd } from "./utils/triggers";
import { registerSearchKnowledge } from "./tools/search";
import { registerLoadContext } from "./tools/load";
import { registerListKnowledge } from "./tools/list";
import { registerLogActivity } from "./tools/log";
import { registerUpdateNetwork } from "./tools/network";
import { registerAppendDecision } from "./tools/decisions";
import { registerAppendFailure } from "./tools/failures";

// Mindset tools (Prompt 11)
import { registerSearchMindset } from "./tools/search-mindset";
import { registerLoadMindset } from "./tools/load-mindset";
import { registerSyncMindsets } from "./tools/sync-mindsets";
import { registerCheckSubscriptions } from "./tools/check-subscriptions";
import { ensureMindsetDirs } from "./mindsets/paths";
import { autoSyncMindsets } from "./mindsets/auto-sync";
import { watchMindsets } from "./mindsets/watcher";

const server = new McpServer({
  name: "know-help",
  version: "2.0.0",
});

// Register all 7 original MCP tools
registerSearchKnowledge(server);
registerLoadContext(server);
registerListKnowledge(server);
registerLogActivity(server);
registerUpdateNetwork(server);
registerAppendDecision(server);
registerAppendFailure(server);

// Register 4 Mindset tools
registerSearchMindset(server);
registerLoadMindset(server);
registerSyncMindsets(server);
registerCheckSubscriptions(server);

async function main() {
  ensureKnowledgeDir();
  ensureMindsetDirs();
  writeClaudeMd();

  // Start file watcher for ~/.know-help/ changes
  watchMindsets();

  // Auto-sync Mindsets on startup (non-blocking)
  autoSyncMindsets().catch((err) =>
    console.error("know.help: Auto-sync failed:", err.message)
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("know.help MCP server running on stdio (11 tools)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
