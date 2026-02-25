import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { db } from "../db/database";
import { requestMagicLink, verifyOtp, requireAuth } from "../auth/magic-link";
import { sendAdminNotification } from "../payments/email";

const router = Router();

const SUBMISSIONS_DIR =
  process.env.SUBMISSIONS_DIR || path.join(__dirname, "..", "..", "data", "submissions");
const PACKS_DIR =
  process.env.PACKS_DIR || path.join(__dirname, "..", "..", "data", "packs");
const REGISTRY_PATH =
  process.env.REGISTRY_PATH || path.join(__dirname, "..", "..", "registry", "packs.json");

// ── Auth routes ─────────────────────────────────────────────────────────────

router.post("/auth/magic-link", async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  const result = await requestMagicLink(email);
  res.json(result);
});

router.post("/auth/verify", async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }
  const result = await verifyOtp(email, otp);
  if (!result.success) {
    return res.status(401).json(result);
  }
  res.json(result);
});

// ── Pack submission ─────────────────────────────────────────────────────────

router.post(
  "/packs/submit",
  requireAuth("creator"),
  async (req: Request, res: Response) => {
    const auth = (req as any).auth;
    const {
      name,
      description,
      long_description,
      category,
      tags,
      price_usd,
      preview_content,
      pack_json,
      files,
    } = req.body;

    // Validate required fields
    if (!name || !description || !category || !pack_json) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate pack.json
    let manifest: any;
    try {
      manifest = typeof pack_json === "string" ? JSON.parse(pack_json) : pack_json;
    } catch {
      return res.status(400).json({ error: "Invalid pack.json" });
    }

    if (!manifest.id || !manifest.files || manifest.files.length === 0) {
      return res.status(400).json({ error: "pack.json must have id and files" });
    }

    if (manifest.files.length > 20) {
      return res.status(400).json({ error: "Maximum 20 files per pack" });
    }

    // Check for executable files
    const executableExts = [".sh", ".js", ".ts", ".py", ".rb", ".exe", ".bat"];
    for (const file of manifest.files) {
      const ext = path.extname(file).toLowerCase();
      if (executableExts.includes(ext)) {
        return res.status(400).json({
          error: `Executable files not allowed: ${file}. Only .md and .jsonl files.`,
        });
      }
    }

    // Validate all .md files have trigger headers
    if (files) {
      for (const [filePath, content] of Object.entries(files)) {
        if (filePath.endsWith(".md") && typeof content === "string") {
          if (!content.includes("Load for:")) {
            return res.status(400).json({
              error: `File ${filePath} is missing "Load for:" trigger header`,
            });
          }
        }
      }
    }

    const packId = manifest.id;
    const priceCents = Math.round((price_usd || 0) * 100);

    // Save submission files
    const submissionDir = path.join(SUBMISSIONS_DIR, packId);
    if (!fs.existsSync(submissionDir)) {
      fs.mkdirSync(submissionDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(submissionDir, "pack.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );

    if (preview_content) {
      fs.writeFileSync(
        path.join(submissionDir, "PREVIEW.md"),
        preview_content,
        "utf-8"
      );
    }

    // Save individual files
    if (files) {
      const knowledgeDir = path.join(submissionDir, "knowledge");
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(knowledgeDir, filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content as string, "utf-8");
      }
    }

    // Insert into database
    db.prepare(
      `INSERT OR REPLACE INTO packs (id, name, author_handle, version, price_cents, category, description, long_description, status, registry_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(
      packId,
      name,
      auth.handle,
      manifest.version || "1.0.0",
      priceCents,
      category,
      description,
      long_description || "",
      "",
      new Date().toISOString()
    );

    // Notify admin
    await sendAdminNotification(
      `New pack submission: ${name}`,
      `<p><strong>${name}</strong> by ${auth.handle}</p>
       <p>Category: ${category} | Price: $${price_usd || 0}</p>
       <p>${description}</p>`
    );

    res.status(201).json({
      success: true,
      message: "Submitted! We review within 48 hours.",
      pack_id: packId,
    });
  }
);

// ── Creator pack list ───────────────────────────────────────────────────────

router.get(
  "/packs/mine",
  requireAuth("creator"),
  (req: Request, res: Response) => {
    const auth = (req as any).auth;
    const packs = db
      .prepare("SELECT * FROM packs WHERE author_handle = ? ORDER BY created_at DESC")
      .all(auth.handle);
    res.json({ packs });
  }
);

// ── Pack detail ─────────────────────────────────────────────────────────────

router.get(
  "/packs/:id",
  requireAuth("creator"),
  (req: Request, res: Response) => {
    const pack = db.prepare("SELECT * FROM packs WHERE id = ?").get(req.params.id) as any;
    if (!pack) {
      return res.status(404).json({ error: "Pack not found" });
    }

    // Get analytics
    const purchases = db
      .prepare(
        "SELECT created_at, buyer_email, amount_cents, status FROM purchases WHERE pack_id = ? ORDER BY created_at DESC LIMIT 50"
      )
      .all(req.params.id);

    const stats = db
      .prepare(
        `SELECT COUNT(*) as total_purchases,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refunded,
                SUM(CASE WHEN status = 'completed' THEN creator_payout_cents ELSE 0 END) as total_revenue
         FROM purchases WHERE pack_id = ?`
      )
      .get(req.params.id) as any;

    res.json({ pack, purchases, stats });
  }
);

// ── Admin routes ────────────────────────────────────────────────────────────

router.get(
  "/admin/submissions",
  requireAuth("admin"),
  (_req: Request, res: Response) => {
    const submissions = db
      .prepare("SELECT * FROM packs WHERE status = 'pending' ORDER BY created_at DESC")
      .all();
    res.json({ submissions });
  }
);

router.get(
  "/admin/pack/:id",
  requireAuth("admin"),
  (req: Request, res: Response) => {
    const pack = db.prepare("SELECT * FROM packs WHERE id = ?").get(req.params.id) as any;
    if (!pack) {
      return res.status(404).json({ error: "Pack not found" });
    }

    // Read submission files
    const submissionDir = path.join(SUBMISSIONS_DIR, req.params.id);
    let fileTree: string[] = [];
    let packJson: any = null;
    let previewContent = "";

    if (fs.existsSync(submissionDir)) {
      fileTree = walkDirRelative(submissionDir);
      const packJsonPath = path.join(submissionDir, "pack.json");
      if (fs.existsSync(packJsonPath)) {
        packJson = JSON.parse(fs.readFileSync(packJsonPath, "utf-8"));
      }
      const previewPath = path.join(submissionDir, "PREVIEW.md");
      if (fs.existsSync(previewPath)) {
        previewContent = fs.readFileSync(previewPath, "utf-8");
      }
    }

    res.json({ pack, fileTree, packJson, previewContent });
  }
);

router.post(
  "/admin/approve",
  requireAuth("admin"),
  (req: Request, res: Response) => {
    const { pack_id } = req.body;
    if (!pack_id) {
      return res.status(400).json({ error: "pack_id is required" });
    }

    const pack = db.prepare("SELECT * FROM packs WHERE id = ?").get(pack_id) as any;
    if (!pack) {
      return res.status(404).json({ error: "Pack not found" });
    }

    // Copy files from submissions to packs
    const srcDir = path.join(SUBMISSIONS_DIR, pack_id);
    const destDir = path.join(PACKS_DIR, pack_id);

    if (fs.existsSync(srcDir)) {
      copyDirRecursive(srcDir, destDir);
    }

    // Update status
    db.prepare("UPDATE packs SET status = 'active' WHERE id = ?").run(pack_id);

    // Add to registry
    addToRegistry(pack);

    res.json({ success: true, message: `Pack ${pack_id} approved and live` });
  }
);

router.post(
  "/admin/reject",
  requireAuth("admin"),
  async (req: Request, res: Response) => {
    const { pack_id, reason } = req.body;
    if (!pack_id || !reason) {
      return res.status(400).json({ error: "pack_id and reason are required" });
    }

    db.prepare("UPDATE packs SET status = 'rejected' WHERE id = ?").run(pack_id);

    // Email creator with reason
    const pack = db.prepare("SELECT * FROM packs WHERE id = ?").get(pack_id) as any;
    if (pack?.author_handle) {
      const creator = db
        .prepare("SELECT email FROM creators WHERE handle = ?")
        .get(pack.author_handle) as any;
      if (creator?.email) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY || "");
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "hello@know.help",
          to: creator.email,
          subject: `Pack submission update: ${pack.name}`,
          html: `<p>Your pack <strong>${pack.name}</strong> was not approved.</p><p>Reason: ${reason}</p><p>You can update and resubmit.</p>`,
        });
      }
    }

    res.json({ success: true, message: `Pack ${pack_id} rejected` });
  }
);

// ── Helpers ─────────────────────────────────────────────────────────────────

function walkDirRelative(dir: string, base?: string): string[] {
  const results: string[] = [];
  base = base || dir;
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDirRelative(fullPath, base));
    } else {
      results.push(path.relative(base, fullPath));
    }
  }
  return results;
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function addToRegistry(pack: any): void {
  let registry: any = { packs: [] };

  if (fs.existsSync(REGISTRY_PATH)) {
    try {
      registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
    } catch {
      registry = { packs: [] };
    }
  } else {
    const dir = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Remove existing entry if updating
  registry.packs = registry.packs.filter((p: any) => p.id !== pack.id);

  registry.packs.push({
    id: pack.id,
    name: pack.name,
    author: pack.author_handle,
    version: pack.version,
    description: pack.description,
    category: pack.category,
    tags: [],
    price_usd: pack.price_cents / 100,
    downloads: pack.downloads || 0,
    registry_url: "",
  });

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf-8");
}

export default router;
