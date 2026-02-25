import express from "express";
import cors from "cors";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { appendJsonl, readJsonl, jsonlEntryExists } from "../utils/jsonl";
import { initDatabase } from "../db/database";
import { createCheckoutSession } from "../payments/checkout";
import { handleStripeWebhook } from "../payments/webhooks";
import { handleDownload, checkDownloadStatus } from "../payments/download";
import { onboardCreator, getCreatorDashboard, triggerPayouts } from "../payments/creators";
import portalRoutes from "../portal/routes";
import dashboardRoutes from "../dashboard/routes";
import billingRoutes from "../hosted/billing";
import onboardingRoutes from "../hosted/onboarding";
import teamRoutes from "../hosted/teams";
import { createWsMcpServer, getActiveConnections } from "../hosted/ws-transport";
import { getQueueStats } from "../intelligence/queue";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const WAITLIST_FILE = path.join(DATA_DIR, "waitlist.jsonl");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
initDatabase();

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [
      "https://know.help",
      "http://localhost:3000",
      "http://localhost:8080",
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  })
);

// Stripe webhook needs raw body — mount before express.json()
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(express.json());

// Email validation
function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// ── Waitlist routes ─────────────────────────────────────────────────────────

app.post("/waitlist", (req, res) => {
  const { email, source } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  const trimmedEmail = email.trim().toLowerCase();

  if (!isValidEmail(trimmedEmail)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email format",
    });
  }

  if (jsonlEntryExists(WAITLIST_FILE, "email", trimmedEmail)) {
    return res.status(409).json({
      success: false,
      message: "You're already on the list",
    });
  }

  const existingEntries = readJsonl(WAITLIST_FILE);
  const position = existingEntries.length + 1;

  appendJsonl(
    WAITLIST_FILE,
    {
      date: new Date().toISOString(),
      email: trimmedEmail,
      source: source || "landing",
      position,
    },
    {
      _schema: "waitlist",
      _version: "1.0",
      _description: "Waitlist signups for know.help",
    }
  );

  return res.status(201).json({
    success: true,
    position,
    message: `You're #${position} on the waitlist`,
  });
});

app.get("/waitlist/count", (_req, res) => {
  const entries = readJsonl(WAITLIST_FILE);
  return res.json({ count: entries.length });
});

// ── Payment routes ──────────────────────────────────────────────────────────

app.post("/checkout/session", async (req, res) => {
  try {
    const result = await createCheckoutSession(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/download/:token", handleDownload);
app.get("/download/check", checkDownloadStatus);

// ── Creator routes ──────────────────────────────────────────────────────────

app.post("/creators/onboard", onboardCreator);
app.get("/creators/dashboard/:handle", getCreatorDashboard);
app.post("/payouts/trigger", triggerPayouts);

// ── Portal routes (auth, pack submission, admin) ────────────────────────────

app.use("/portal", portalRoutes);

// ── Dashboard routes (file mgmt, network, intelligence, logs) ───────────────

app.use("/api", dashboardRoutes);

// ── Hosted routes (billing, onboarding, teams) ──────────────────────────────

app.use("/api", billingRoutes);
app.use("/api", onboardingRoutes);
app.use("/api", teamRoutes);

// ── Health check ────────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  const queueStats = await getQueueStats().catch(() => null);
  return res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    ws_connections: getActiveConnections(),
    queue: queueStats,
  });
});

// ── Create HTTP server and attach WebSocket ────────────────────────────────

const httpServer = http.createServer(app);

export { app, httpServer, PORT };

if (require.main === module) {
  // Attach WebSocket MCP server to HTTP server
  createWsMcpServer(httpServer);

  // Optionally initialize managed crawler queue if Redis is available
  if (process.env.REDIS_URL) {
    import("../intelligence/queue").then(({ initCrawlQueue }) => {
      try {
        initCrawlQueue();
        console.log("Managed crawler queue initialized");
      } catch (err: any) {
        console.warn(`Crawler queue disabled (no Redis): ${err.message}`);
      }
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`know.help API running on port ${PORT}`);
    console.log(`WebSocket MCP available at ws://localhost:${PORT}/mcp/ws`);
  });
}
