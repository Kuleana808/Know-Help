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

const server = new McpServer({
  name: "know-help",
  version: "1.0.0",
});

// Register all 7 MCP tools
registerSearchKnowledge(server);
registerLoadContext(server);
registerListKnowledge(server);
registerLogActivity(server);
registerUpdateNetwork(server);
registerAppendDecision(server);
registerAppendFailure(server);

async function main() {
  ensureKnowledgeDir();
  writeClaudeMd();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("know.help MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
