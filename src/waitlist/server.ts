import express from "express";
import cors from "cors";
import * as path from "path";
import * as fs from "fs";
import { appendJsonl, readJsonl, jsonlEntryExists } from "../utils/jsonl";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const WAITLIST_FILE = path.join(DATA_DIR, "waitlist.jsonl");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  })
);

app.use(express.json());

// Email validation
function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// POST /waitlist
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

  // Check for duplicates
  if (jsonlEntryExists(WAITLIST_FILE, "email", trimmedEmail)) {
    return res.status(409).json({
      success: false,
      message: "You're already on the list",
    });
  }

  // Count existing entries to determine position
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

// GET /waitlist/count
app.get("/waitlist/count", (_req, res) => {
  const entries = readJsonl(WAITLIST_FILE);
  return res.json({ count: entries.length });
});

// Health check
app.get("/health", (_req, res) => {
  return res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export { app, PORT };

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`know.help waitlist API running on port ${PORT}`);
  });
}
