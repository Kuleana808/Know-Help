/**
 * know serve — Start MCP server or print config
 */

import * as path from "path";
import { checkAuth } from "./auth";

interface ServeOptions {
  config?: boolean;
  port?: string;
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  if (options.config) {
    await printConfig();
    return;
  }

  // Start MCP server (delegate to src/index.ts)
  require("../index");
}

async function printConfig(): Promise<void> {
  const auth = await checkAuth();
  const tokenValue = auth?.token || "your-token-here";

  const config = {
    mcpServers: {
      "know-help": {
        command: "npx",
        args: ["know-help@latest", "serve"],
        env: {
          KNOW_HELP_TOKEN: tokenValue,
        },
      },
    },
  };

  console.log("");
  console.log("Add this to your Claude Desktop config:");
  console.log("");
  console.log(JSON.stringify(config, null, 2));
  console.log("");

  // Show config file path
  const platform = process.platform;
  if (platform === "darwin") {
    console.log("Config file location:");
    console.log("  ~/Library/Application Support/Claude/claude_desktop_config.json");
  } else if (platform === "win32") {
    console.log("Config file location:");
    console.log("  %APPDATA%\\Claude\\claude_desktop_config.json");
  } else {
    console.log("Config file location:");
    console.log("  ~/.config/claude/claude_desktop_config.json");
  }

  if (auth?.token) {
    console.log("");
    console.log("Your token has been included in the config above.");
  } else {
    console.log("");
    console.log("Replace 'your-token-here' with your actual token.");
    console.log("Run 'know login' to authenticate first.");
  }
}
