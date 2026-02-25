/**
 * Capture signal sync routes (Prompt 15).
 * Browser extension syncs captured signals to these endpoints.
 */

import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/database";
import { requireAuth } from "../auth/magic-link";
import { detectInjection } from "../lib/injection-detector";
import { logSecurityEvent } from "../lib/security-logger";

const router = Router();

/**
 * POST /sync — Sync captured signals from browser extension
 */
router.post("/sync", requireAuth(), (req: Request, res: Response) => {
  try {
    const { signals } = req.body;
    const creator = (req as any).creator;

    if (!Array.isArray(signals)) {
      return res.status(400).json({ error: "signals array required" });
    }

    // Reject oversized payloads
    const payloadSize = JSON.stringify(signals).length;
    if (payloadSize > 10240) {
      return res.status(413).json({ error: "Payload too large. Maximum 10KB." });
    }

    const now = new Date().toISOString();
    const synced: string[] = [];
    const statusUpdates: Array<{ id: string; status: string }> = [];

    const upsert = db.prepare(`
      INSERT INTO capture_signals (id, creator_id, local_id, signal_type, content, context, platform, url, confidence, status, synced_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(id) DO UPDATE SET synced_at = ?
    `);

    for (const signal of signals.slice(0, 50)) {
      const id = signal.id || uuid();

      // Security: skip signals with injection patterns
      const injectionCheck = detectInjection(signal.content || "");
      if (injectionCheck.detected) {
        logSecurityEvent("injection_attempt", {
          source: "capture_sync",
          platform: signal.platform,
          patterns: injectionCheck.patterns,
        }, { creator_id: creator.id });
        continue; // Skip this signal silently
      }

      try {
        upsert.run(
          id,
          creator.id,
          signal.local_id || id,
          signal.type || "unknown",
          (signal.content || "").slice(0, 3000),
          (signal.context || "").slice(0, 1000),
          signal.platform || "unknown",
          "", // Don't store full URL
          signal.confidence || 0,
          now,
          signal.timestamp ? new Date(signal.timestamp).toISOString() : now,
          now
        );
        synced.push(id);
      } catch {
        // Skip duplicates or invalid
      }
    }

    // Get any status updates for this creator's signals
    const updated = db.prepare(
      "SELECT id, status FROM capture_signals WHERE creator_id = ? AND status != 'pending' AND synced_at > datetime('now', '-7 days')"
    ).all(creator.id) as any[];

    res.json({
      synced,
      status_updates: updated.map((u: any) => ({ id: u.id, status: u.status })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /signals — List capture signals for current creator
 */
router.get("/signals", requireAuth(), (req: Request, res: Response) => {
  try {
    const creator = (req as any).creator;
    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM capture_signals WHERE creator_id = ?";
    const params: any[] = [creator.id];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const signals = db.prepare(query).all(...params);
    const total = db.prepare(
      `SELECT COUNT(*) as cnt FROM capture_signals WHERE creator_id = ?${status ? " AND status = ?" : ""}`
    ).get(...[creator.id, ...(status ? [status] : [])]) as any;

    res.json({ signals, total: total?.cnt || 0, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /signals/:id — Update a capture signal
 */
router.patch("/signals/:id", requireAuth(), (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, edited_content, load_for } = req.body;
    const creator = (req as any).creator;

    const signal = db.prepare(
      "SELECT id FROM capture_signals WHERE id = ? AND creator_id = ?"
    ).get(id, creator.id);
    if (!signal) return res.status(404).json({ error: "Signal not found" });

    const updates: string[] = [];
    const values: any[] = [];

    if (status) {
      updates.push("status = ?");
      values.push(status);
      updates.push("reviewed_at = ?");
      values.push(new Date().toISOString());
    }
    if (edited_content !== undefined) {
      updates.push("edited_content = ?");
      values.push(edited_content);
    }
    if (load_for !== undefined) {
      updates.push("load_for = ?");
      values.push(load_for);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    values.push(id);
    db.prepare(`UPDATE capture_signals SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /publish — Publish approved capture signals to Mindset
 */
router.post("/publish", requireAuth(), async (req: Request, res: Response) => {
  try {
    const { signal_ids, mindset_id } = req.body;
    const creator = (req as any).creator;

    if (!Array.isArray(signal_ids) || !mindset_id) {
      return res.status(400).json({ error: "signal_ids array and mindset_id required" });
    }

    const mindset = db.prepare(
      "SELECT * FROM mindsets WHERE id = ? AND creator_handle = ?"
    ).get(mindset_id, creator.handle) as any;
    if (!mindset) return res.status(404).json({ error: "Mindset not found" });

    const placeholders = signal_ids.map(() => "?").join(",");
    const signals = db.prepare(
      `SELECT * FROM capture_signals WHERE id IN (${placeholders}) AND creator_id = ? AND status = 'approved'`
    ).all(...signal_ids, creator.id) as any[];

    if (signals.length === 0) {
      return res.status(400).json({ error: "No approved signals found" });
    }

    // Use extractor to generate draft files
    const { generateDraftFiles } = await import("../import/extractor");

    const drafts = await generateDraftFiles(
      signals.map((s: any) => ({
        id: s.id,
        signal_type: s.signal_type,
        content: s.edited_content || s.content,
        suggested_load_for: s.load_for || s.signal_type,
      })),
      creator.id
    );

    const { storeMindsetFile, contentHash } = await import("../mindsets/storage");
    const now = new Date().toISOString();
    let filesUpdated = 0;

    for (const draft of drafts) {
      await storeMindsetFile(creator.handle, mindset.slug, draft.filepath, draft.content);

      const existing = db.prepare(
        "SELECT id FROM mindset_files WHERE mindset_id = ? AND filepath = ?"
      ).get(mindset_id, draft.filepath) as any;

      if (existing) {
        db.prepare(
          "UPDATE mindset_files SET load_for = ?, size_bytes = ?, content_hash = ?, updated_at = ? WHERE id = ?"
        ).run(draft.load_for, Buffer.byteLength(draft.content), contentHash(draft.content), now, existing.id);
      } else {
        db.prepare(`
          INSERT INTO mindset_files (id, mindset_id, filepath, load_for, size_bytes, version, content_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuid(), mindset_id, draft.filepath, draft.load_for,
          Buffer.byteLength(draft.content), mindset.version,
          contentHash(draft.content), now, now
        );
      }
      filesUpdated++;
    }

    // Bump version
    const versionParts = (mindset.version || "1.0.0").split(".").map(Number);
    versionParts[2] = (versionParts[2] || 0) + 1;
    const newVersion = versionParts.join(".");

    db.prepare(
      "UPDATE mindsets SET version = ?, last_updated_at = ? WHERE id = ?"
    ).run(newVersion, now, mindset_id);

    res.json({ files_updated: filesUpdated, version: newVersion });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
