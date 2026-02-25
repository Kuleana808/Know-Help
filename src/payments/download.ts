import { Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import archiver from "archiver";
import { db } from "../db/database";

const PACKS_DIR =
  process.env.PACKS_DIR || path.join(__dirname, "..", "..", "data", "packs");
const MAX_DOWNLOADS_PER_TOKEN = 3;

export async function handleDownload(
  req: Request,
  res: Response
): Promise<void> {
  const { token } = req.params;

  const purchase = db
    .prepare("SELECT * FROM purchases WHERE download_token = ?")
    .get(token) as any;

  if (!purchase) {
    res.status(404).json({ error: "Invalid download token" });
    return;
  }

  if (new Date(purchase.download_expires_at) < new Date()) {
    res.status(410).json({
      error: "Download link expired. Contact support@know.help",
    });
    return;
  }

  // Rate limit: max downloads per token
  const downloadCount = purchase.download_count || 0;
  if (downloadCount >= MAX_DOWNLOADS_PER_TOKEN) {
    res.status(429).json({
      error: "Download limit reached for this token. Contact support@know.help",
    });
    return;
  }

  // Path traversal protection on pack_id
  const safePack = path.basename(purchase.pack_id);
  const packDir = path.join(PACKS_DIR, safePack);

  if (!fs.existsSync(packDir)) {
    res.status(404).json({ error: "Pack files not found" });
    return;
  }

  // Mark as installed and increment download count
  db.prepare(
    "UPDATE purchases SET installed_at = ?, download_count = COALESCE(download_count, 0) + 1 WHERE id = ?"
  ).run(new Date().toISOString(), purchase.id);

  // Stream pack as zip
  const pack = db
    .prepare("SELECT name FROM packs WHERE id = ?")
    .get(purchase.pack_id) as any;
  const zipName = `${purchase.pack_id}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    console.error("Archive error:", err);
    res.status(500).json({ error: "Failed to create archive" });
  });

  archive.pipe(res);
  archive.directory(packDir, purchase.pack_id);
  await archive.finalize();
}

export async function checkDownloadStatus(
  req: Request,
  res: Response
): Promise<void> {
  const { email, pack_id } = req.query;

  if (!email || !pack_id) {
    res.status(400).json({ error: "Missing email or pack_id" });
    return;
  }

  const purchase = db
    .prepare(
      "SELECT * FROM purchases WHERE buyer_email = ? AND pack_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1"
    )
    .get(email, pack_id) as any;

  if (!purchase) {
    res.json({ ready: false });
    return;
  }

  res.json({
    ready: true,
    download_token: purchase.download_token,
    expires_at: purchase.download_expires_at,
  });
}
