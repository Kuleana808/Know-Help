/**
 * WebSocket MCP transport for hosted tier.
 * Each authenticated user gets a persistent WebSocket connection
 * that proxies MCP protocol messages to their isolated knowledge base.
 */
import { WebSocketServer, WebSocket } from "ws";
import * as http from "http";
import * as crypto from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../db/database";

// ── Types ───────────────────────────────────────────────────────────────────

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  s3Prefix?: string;
  isAlive?: boolean;
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

// ── JWT verification (reuse logic from magic-link.ts) ───────────────────────

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function verifyJwt(token: string): { userId: string; email: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (header.alg !== "HS256") return null;

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    // Verify signature
    const data = `${parts[0]}.${parts[1]}`;
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(data)
      .digest("base64url");

    if (expectedSig !== parts[2]) return null;

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

// ── Connection registry ─────────────────────────────────────────────────────

const connections = new Map<string, Set<AuthenticatedSocket>>();

export function getActiveConnections(): number {
  let total = 0;
  for (const sockets of connections.values()) {
    total += sockets.size;
  }
  return total;
}

export function getUserConnections(userId: string): number {
  return connections.get(userId)?.size || 0;
}

// ── WebSocket MCP Server ────────────────────────────────────────────────────

/**
 * Create and attach the WebSocket MCP server to an existing HTTP server.
 * Path: /mcp/ws or /mcp/ws?token=<jwt>
 *
 * Authentication:
 * - Query parameter: ?token=<jwt>
 * - Header: Authorization: Bearer <jwt>
 * - First message: { type: "auth", token: "<jwt>" }
 */
export function createWsMcpServer(httpServer: http.Server): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/mcp/ws",
    maxPayload: 1024 * 1024, // 1MB max message size
  });

  // Heartbeat interval — detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (socket.isAlive === false) {
        removeConnection(socket);
        return socket.terminate();
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  wss.on("connection", (ws: AuthenticatedSocket, req: http.IncomingMessage) => {
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // Try to authenticate from query string or header
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const tokenFromQuery = url.searchParams.get("token");
    const authHeader = req.headers.authorization;
    const tokenFromHeader = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    const token = tokenFromQuery || tokenFromHeader;

    if (token) {
      const auth = authenticateSocket(ws, token);
      if (!auth) {
        ws.close(4001, "Invalid or expired token");
        return;
      }
    }

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as any;

        // Handle auth message if not yet authenticated
        if (!ws.userId && message.type === "auth" && message.token) {
          const auth = authenticateSocket(ws, message.token);
          if (!auth) {
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32000, message: "Authentication failed" },
              })
            );
            ws.close(4001, "Authentication failed");
          } else {
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                result: {
                  authenticated: true,
                  userId: ws.userId,
                },
              })
            );
          }
          return;
        }

        // Reject unauthenticated messages
        if (!ws.userId) {
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32000,
                message: "Not authenticated. Send auth message first.",
              },
            })
          );
          return;
        }

        // Route MCP JSON-RPC messages
        handleMcpMessage(ws, message as JsonRpcMessage);
      } catch (err: any) {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
          })
        );
      }
    });

    ws.on("close", () => {
      removeConnection(ws);
    });

    ws.on("error", (err) => {
      console.error(`[ws-mcp] Socket error for user ${ws.userId}:`, err.message);
      removeConnection(ws);
    });
  });

  console.log("[ws-mcp] WebSocket MCP server attached at /mcp/ws");
  return wss;
}

// ── Authentication ──────────────────────────────────────────────────────────

function authenticateSocket(
  ws: AuthenticatedSocket,
  token: string
): boolean {
  const auth = verifyJwt(token);
  if (!auth) return false;

  // Look up user for s3_prefix
  const user = db
    .prepare("SELECT id, s3_prefix, subscription_status, trial_ends_at FROM users WHERE id = ?")
    .get(auth.userId) as any;

  if (!user) return false;

  // Check subscription
  const isActive =
    user.subscription_status === "active" ||
    user.subscription_status === "trialing";

  if (user.subscription_status === "trialing" && user.trial_ends_at) {
    if (new Date(user.trial_ends_at) < new Date()) return false;
  }

  if (!isActive) return false;

  ws.userId = user.id;
  ws.s3Prefix = user.s3_prefix;

  // Register connection
  if (!connections.has(user.id)) {
    connections.set(user.id, new Set());
  }
  connections.get(user.id)!.add(ws);

  console.log(
    `[ws-mcp] User ${user.id} connected (${getUserConnections(user.id)} active)`
  );
  return true;
}

function removeConnection(ws: AuthenticatedSocket): void {
  if (ws.userId) {
    const userConns = connections.get(ws.userId);
    if (userConns) {
      userConns.delete(ws);
      if (userConns.size === 0) {
        connections.delete(ws.userId);
      }
    }
  }
}

// ── MCP Message Handler ─────────────────────────────────────────────────────

/**
 * Handle MCP JSON-RPC messages over WebSocket.
 * Maps MCP protocol methods to server-side tool execution
 * scoped to the user's knowledge base.
 */
async function handleMcpMessage(
  ws: AuthenticatedSocket,
  message: JsonRpcMessage
): Promise<void> {
  const { id, method, params } = message;

  // MCP protocol methods
  switch (method) {
    case "initialize": {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: "know-help-hosted",
              version: "1.0.0",
            },
          },
        })
      );
      break;
    }

    case "notifications/initialized": {
      // Client acknowledged — no response needed
      break;
    }

    case "tools/list": {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            tools: getMcpToolDefinitions(),
          },
        })
      );
      break;
    }

    case "tools/call": {
      try {
        const result = await executeMcpTool(
          ws.userId!,
          ws.s3Prefix!,
          params?.name,
          params?.arguments || {}
        );
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: result }],
            },
          })
        );
      } catch (err: any) {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: `Error: ${err.message}` }],
              isError: true,
            },
          })
        );
      }
      break;
    }

    case "ping": {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, result: {} }));
      break;
    }

    default: {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        })
      );
    }
  }
}

// ── Tool definitions (mirroring self-hosted MCP tools) ──────────────────────

function getMcpToolDefinitions() {
  return [
    {
      name: "search_knowledge",
      description:
        "Search your knowledge base for files matching a query. Returns file paths with trigger keywords.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "load_context",
      description: "Load the full content of a knowledge file.",
      inputSchema: {
        type: "object",
        properties: {
          filepath: { type: "string", description: "Relative file path" },
        },
        required: ["filepath"],
      },
    },
    {
      name: "list_knowledge",
      description: "List all files in your knowledge base.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "log_activity",
      description: "Log an activity entry to today's daily log.",
      inputSchema: {
        type: "object",
        properties: {
          entry: { type: "string", description: "Activity to log" },
        },
        required: ["entry"],
      },
    },
    {
      name: "update_network",
      description: "Add a note to a contact in your network.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Contact name" },
          notes: { type: "string", description: "Notes about the interaction" },
        },
        required: ["name", "notes"],
      },
    },
    {
      name: "append_decision",
      description: "Log a business decision with reasoning.",
      inputSchema: {
        type: "object",
        properties: {
          venture: { type: "string" },
          decision: { type: "string" },
          reasoning: { type: "string" },
          alternatives: {
            type: "array",
            items: { type: "string" },
            description: "Alternatives considered",
          },
        },
        required: ["venture", "decision", "reasoning"],
      },
    },
    {
      name: "append_failure",
      description: "Log a failure with root cause analysis.",
      inputSchema: {
        type: "object",
        properties: {
          venture: { type: "string" },
          what_failed: { type: "string" },
          root_cause: { type: "string" },
          prevention: { type: "string" },
        },
        required: ["venture", "what_failed", "root_cause", "prevention"],
      },
    },
  ];
}

// ── Tool execution (scoped to user's S3 prefix) ────────────────────────────

import { s3Ops } from "./s3";

async function executeMcpTool(
  userId: string,
  s3Prefix: string,
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "search_knowledge": {
      const files = await s3Ops.list(s3Prefix);
      const query = (args.query || "").toLowerCase();
      const matches: { file: string; triggers: string }[] = [];

      for (const file of files) {
        if (!file.endsWith(".md") && !file.endsWith(".jsonl")) continue;
        try {
          const content = await s3Ops.read(s3Prefix, file);
          const triggerMatch = content.match(/Load for:\s*(.+)/);
          const triggers = triggerMatch ? triggerMatch[1].trim() : "";
          if (
            triggers.toLowerCase().includes(query) ||
            file.toLowerCase().includes(query) ||
            content.toLowerCase().includes(query)
          ) {
            matches.push({ file, triggers });
          }
        } catch {
          // Skip unreadable files
        }
      }

      if (matches.length === 0) return `No files matched query: "${args.query}"`;
      return matches
        .map((m) => `${m.file} — triggers: ${m.triggers || "(none)"}`)
        .join("\n");
    }

    case "load_context": {
      const filepath = args.filepath;
      if (!filepath || filepath.includes("..")) {
        throw new Error("Invalid filepath");
      }
      return await s3Ops.read(s3Prefix, filepath);
    }

    case "list_knowledge": {
      const files = await s3Ops.list(s3Prefix);
      const tree: Record<string, string[]> = {};
      for (const file of files) {
        const dir = file.includes("/") ? file.split("/")[0] : ".";
        if (!tree[dir]) tree[dir] = [];
        tree[dir].push(file);
      }
      return JSON.stringify(tree, null, 2);
    }

    case "log_activity": {
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      const h12 = hours % 12 || 12;
      const timeStr = `${h12}:${minutes} ${ampm}`;

      const logFile = `log/${dateStr}.md`;
      const entry = `- [${timeStr}] ${args.entry}\n`;

      const exists = await s3Ops.exists(s3Prefix, logFile);
      if (!exists) {
        await s3Ops.write(
          s3Prefix,
          logFile,
          `# Activity Log — ${dateStr}\n\n${entry}`
        );
      } else {
        await s3Ops.append(s3Prefix, logFile, entry);
      }
      return `Logged: ${args.entry}`;
    }

    case "update_network": {
      const name = args.name;
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const contactFile = `network/${slug}.jsonl`;

      const entry = JSON.stringify({
        date: new Date().toISOString(),
        name,
        notes: args.notes,
      });

      const exists = await s3Ops.exists(s3Prefix, contactFile);
      if (!exists) {
        const schema = JSON.stringify({
          _schema: "contact",
          _version: "1.0",
          _description: `Interaction log for ${name}`,
        });
        await s3Ops.write(s3Prefix, contactFile, schema + "\n" + entry + "\n");
      } else {
        await s3Ops.append(s3Prefix, contactFile, entry + "\n");
      }
      return `Updated network: ${name}`;
    }

    case "append_decision": {
      const entry = JSON.stringify({
        date: new Date().toISOString(),
        venture: args.venture,
        decision: args.decision,
        reasoning: args.reasoning,
        alternatives: args.alternatives || [],
        outcome: "pending",
      });
      await s3Ops.append(s3Prefix, "log/decisions.jsonl", entry + "\n");
      return `Decision logged for ${args.venture}: ${args.decision}`;
    }

    case "append_failure": {
      const entry = JSON.stringify({
        date: new Date().toISOString(),
        venture: args.venture,
        what_failed: args.what_failed,
        root_cause: args.root_cause,
        prevention: args.prevention,
      });
      await s3Ops.append(s3Prefix, "log/failures.jsonl", entry + "\n");
      return `Failure logged for ${args.venture}: ${args.what_failed}`;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
