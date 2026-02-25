import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { KNOWLEDGE_DIR, ROOT_DIR, walkDir, resolveKnowledgePath, slugify } from "../utils/paths";
import { extractTriggerKeywords, buildFileInventory } from "../utils/triggers";
import { extractJsonlSchema, readJsonl, appendJsonl } from "../utils/jsonl";
import { runCrawl } from "../intelligence/crawler";

const router = Router();

// ── File tree ───────────────────────────────────────────────────────────────

router.get("/files/tree", (_req: Request, res: Response) => {
  const inventory = buildFileInventory();
  const tree = inventory.map((file) => {
    const entry: Record<string, unknown> = {
      path: file.relativePath,
      type: file.type,
    };
    if (file.triggerKeywords) entry.triggers = file.triggerKeywords;
    if (file.schemaInfo) {
      entry.schema = file.schemaInfo.schema;
      entry.description = file.schemaInfo.description;
    }

    // Get last modified
    const fullPath = path.join(KNOWLEDGE_DIR, file.relativePath);
    try {
      const stats = fs.statSync(fullPath);
      entry.modified = stats.mtime.toISOString();
      entry.size = stats.size;
    } catch {
      // skip
    }

    return entry;
  });

  res.json({ files: tree });
});

// ── File content ────────────────────────────────────────────────────────────

router.get("/files/content", (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: "path parameter required" });
  }

  const resolved = resolveKnowledgePath(filePath);
  if (!resolved) {
    return res.status(403).json({ error: "Path traversal detected" });
  }

  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: "File not found" });
  }

  const content = fs.readFileSync(resolved, "utf-8");
  const ext = path.extname(resolved).toLowerCase();
  const triggers = ext === ".md" ? extractTriggerKeywords(content) : [];

  res.json({
    path: filePath,
    content,
    type: ext === ".md" ? "md" : ext === ".jsonl" ? "jsonl" : "other",
    triggers,
    modified: fs.statSync(resolved).mtime.toISOString(),
  });
});

// ── File save ───────────────────────────────────────────────────────────────

router.post("/files/save", (req: Request, res: Response) => {
  const { path: filePath, content } = req.body;

  if (!filePath || content === undefined) {
    return res.status(400).json({ error: "path and content required" });
  }

  const resolved = resolveKnowledgePath(filePath);
  if (!resolved) {
    return res.status(403).json({ error: "Path traversal detected" });
  }

  // JSONL append-only validation
  if (filePath.endsWith(".jsonl") && fs.existsSync(resolved)) {
    const existingLines = fs.readFileSync(resolved, "utf-8").split("\n").filter(Boolean);
    const newLines = content.split("\n").filter(Boolean);

    // Check that all existing lines are preserved
    for (let i = 0; i < existingLines.length; i++) {
      if (i >= newLines.length || newLines[i] !== existingLines[i]) {
        return res.status(400).json({
          error: "JSONL files are append-only. Existing lines cannot be modified or removed.",
        });
      }
    }
  }

  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolved, content, "utf-8");
  res.json({ success: true, message: `Saved ${filePath}` });
});

// ── File delete ─────────────────────────────────────────────────────────────

router.delete("/files/delete", (req: Request, res: Response) => {
  const { path: filePath, confirm_token } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: "path required" });
  }

  const resolved = resolveKnowledgePath(filePath);
  if (!resolved) {
    return res.status(403).json({ error: "Path traversal detected" });
  }

  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: "File not found" });
  }

  // Two-step confirmation
  if (!confirm_token) {
    const token = `delete-${Date.now()}-${filePath}`;
    return res.json({
      confirm_token: token,
      message: `Are you sure you want to delete ${filePath}? Send this confirm_token to proceed.`,
    });
  }

  fs.unlinkSync(resolved);
  res.json({ success: true, message: `Deleted ${filePath}` });
});

// ── File rename ─────────────────────────────────────────────────────────────

router.post("/files/rename", (req: Request, res: Response) => {
  const { from, to } = req.body;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to required" });
  }

  const resolvedFrom = resolveKnowledgePath(from);
  const resolvedTo = resolveKnowledgePath(to);

  if (!resolvedFrom || !resolvedTo) {
    return res.status(403).json({ error: "Path traversal detected" });
  }

  if (!fs.existsSync(resolvedFrom)) {
    return res.status(404).json({ error: "Source file not found" });
  }

  const dir = path.dirname(resolvedTo);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.renameSync(resolvedFrom, resolvedTo);
  res.json({ success: true, message: `Renamed ${from} to ${to}` });
});

// ── Network contacts ────────────────────────────────────────────────────────

router.get("/network/contacts", (_req: Request, res: Response) => {
  const networkDir = path.join(KNOWLEDGE_DIR, "network");
  if (!fs.existsSync(networkDir)) {
    return res.json({ contacts: [] });
  }

  const files = fs.readdirSync(networkDir).filter((f) => f.endsWith(".jsonl") && f !== "_schema.jsonl");
  const contacts = files.map((file) => {
    const filePath = path.join(networkDir, file);
    const entries = readJsonl(filePath);
    const slug = file.replace(".jsonl", "");
    const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

    return {
      slug,
      name: (lastEntry as any)?.name || slug.replace(/-/g, " "),
      last_interaction: (lastEntry as any)?.date || null,
      entry_count: entries.length,
    };
  });

  contacts.sort((a, b) => {
    if (!a.last_interaction) return 1;
    if (!b.last_interaction) return -1;
    return new Date(b.last_interaction).getTime() - new Date(a.last_interaction).getTime();
  });

  res.json({ contacts });
});

router.get("/network/:slug", (req: Request, res: Response) => {
  const filePath = path.join(KNOWLEDGE_DIR, "network", `${req.params.slug}.jsonl`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Contact not found" });
  }

  const entries = readJsonl(filePath);
  res.json({ slug: req.params.slug, entries });
});

router.post("/network/:slug/add", (req: Request, res: Response) => {
  const { notes } = req.body;
  if (!notes) {
    return res.status(400).json({ error: "notes required" });
  }

  const slug = req.params.slug;
  const name = slug.replace(/-/g, " ");
  const filePath = path.join(KNOWLEDGE_DIR, "network", `${slug}.jsonl`);

  appendJsonl(
    filePath,
    { date: new Date().toISOString(), name, notes },
    { _schema: "contact", _version: "1.0", _description: `Interaction log for ${name}` }
  );

  res.json({ success: true, message: `Note added for ${name}` });
});

// ── Intelligence ────────────────────────────────────────────────────────────

router.get("/intelligence/status", (_req: Request, res: Response) => {
  const configPath = path.join(ROOT_DIR, "knowledge.config.json");
  if (!fs.existsSync(configPath)) {
    return res.json({ sources: {}, next_run: null });
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const crawlLogPath = path.join(KNOWLEDGE_DIR, "log", "crawl.jsonl");
  const crawlEntries = readJsonl(crawlLogPath);
  const lastCrawl = crawlEntries.length > 0 ? crawlEntries[crawlEntries.length - 1] : null;

  const sources: Record<string, any> = {};
  for (const [name, cfg] of Object.entries(config.sources || {})) {
    sources[name] = {
      enabled: (cfg as any).enabled || false,
      last_run: (lastCrawl as any)?.start_time || null,
      items_last_run: null,
    };
  }

  res.json({ sources, last_crawl: lastCrawl });
});

router.post("/intelligence/crawl", async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`data: ${JSON.stringify({ status: "starting" })}\n\n`);

  try {
    const result = await runCrawl();
    res.write(`data: ${JSON.stringify({ status: "completed", result })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ status: "error", message: err.message })}\n\n`);
  }

  res.end();
});

router.get("/intelligence/signals", (req: Request, res: Response) => {
  const ventureFilter = req.query.venture as string;
  const typeFilter = req.query.type as string;
  const limit = parseInt(req.query.limit as string || "50", 10);

  const ventureDir = path.join(KNOWLEDGE_DIR, "venture");
  const signals: any[] = [];

  if (fs.existsSync(ventureDir)) {
    const files = fs.readdirSync(ventureDir).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      if (ventureFilter && !file.includes(ventureFilter)) continue;

      const content = fs.readFileSync(path.join(ventureDir, file), "utf-8");
      const feedIndex = content.indexOf("## Intelligence feed");
      if (feedIndex === -1) continue;

      const feedContent = content.slice(feedIndex);
      const entryRegex = /\*\*\[(\d{4}-\d{2}-\d{2})\]\s+(\w+)\*\*\s*—\s*(.+)\n>\s*Source:\s*(.+)\n>\s*Action:\s*(.+)/g;
      let match;

      while ((match = entryRegex.exec(feedContent)) !== null) {
        const signal = {
          date: match[1],
          signal_type: match[2],
          summary: match[3].trim(),
          source_url: match[4].trim(),
          action: match[5].trim(),
          venture: file.replace(".md", ""),
        };

        if (typeFilter && signal.signal_type !== typeFilter) continue;
        signals.push(signal);
      }
    }
  }

  // Sort by date descending
  signals.sort((a, b) => b.date.localeCompare(a.date));
  res.json({ signals: signals.slice(0, limit) });
});

// ── Intelligence config ─────────────────────────────────────────────────────

router.get("/intelligence/config", (_req: Request, res: Response) => {
  const configPath = path.join(ROOT_DIR, "knowledge.config.json");
  if (!fs.existsSync(configPath)) {
    return res.status(404).json({ error: "knowledge.config.json not found" });
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  res.json(config);
});

router.post("/intelligence/config", (req: Request, res: Response) => {
  const configPath = path.join(ROOT_DIR, "knowledge.config.json");
  fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2), "utf-8");
  res.json({ success: true, message: "Configuration saved" });
});

// ── Logs ────────────────────────────────────────────────────────────────────

router.get("/log/decisions", (_req: Request, res: Response) => {
  const filePath = path.join(KNOWLEDGE_DIR, "log", "decisions.jsonl");
  const entries = readJsonl(filePath);
  res.json({ decisions: entries });
});

router.get("/log/failures", (_req: Request, res: Response) => {
  const filePath = path.join(KNOWLEDGE_DIR, "log", "failures.jsonl");
  const entries = readJsonl(filePath);
  res.json({ failures: entries });
});

router.get("/log/activity", (req: Request, res: Response) => {
  const date = req.query.date as string || new Date().toISOString().split("T")[0];
  const filePath = path.join(KNOWLEDGE_DIR, "log", `${date}.md`);

  if (!fs.existsSync(filePath)) {
    return res.json({ date, content: "" });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  res.json({ date, content });
});

export default router;
