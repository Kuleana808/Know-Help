/**
 * Conversation Import Pipeline API routes (Prompt 14).
 * Handles upload, parsing, signal extraction, review, and publishing.
 */

import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/database";
import { requireAuth } from "../auth/magic-link";
import { parseExport, detectFormat } from "./parser";
import { extractSignals, generateDraftFiles } from "./extractor";
import { ImportSource } from "./types";
import { detectInjection } from "../lib/injection-detector";
import { quickPIICheck, scanForPII } from "../lib/pii-scrubber";
import { logSecurityEvent } from "../lib/security-logger";

const router = Router();

// ============================================================
// IMPORT ENDPOINTS (all require creator auth)
// ============================================================

/**
 * POST /upload — Upload conversation export file
 * Body: { content: string, fileName: string, source?: ImportSource }
 * (File content sent as base64 or raw string)
 */
router.post("/upload", requireAuth(), async (req: Request, res: Response) => {
  try {
    const { content, fileName, source } = req.body;
    const creator = (req as any).creator;

    if (!content || !fileName) {
      return res.status(400).json({ error: "content and fileName required" });
    }

    // Decode base64 if applicable
    let fileContent: string;
    try {
      fileContent = Buffer.from(content, "base64").toString("utf-8");
      // Verify it's valid text
      if (fileContent.includes("\ufffd")) {
        fileContent = content; // Not base64, use raw
      }
    } catch {
      fileContent = content;
    }

    const fileSizeBytes = Buffer.byteLength(fileContent, "utf-8");
    if (fileSizeBytes > 50 * 1024 * 1024) {
      return res.status(400).json({ error: "File too large. Maximum 50MB." });
    }

    const jobId = uuid();
    const now = new Date().toISOString();
    const detectedSource = source || detectFormat(fileName, fileContent);

    // Create job record
    db.prepare(`
      INSERT INTO import_jobs (id, creator_id, status, source, file_name, file_size_bytes, created_at)
      VALUES (?, ?, 'pending', ?, ?, ?, ?)
    `).run(jobId, creator.id, detectedSource, fileName, fileSizeBytes, now);

    // Start processing in background
    processImportJob(jobId, creator.id, fileName, fileContent, detectedSource).catch((err) => {
      db.prepare("UPDATE import_jobs SET status = 'failed', error = ? WHERE id = ?").run(
        err.message || "Processing failed",
        jobId
      );
    });

    res.json({ job_id: jobId, source: detectedSource });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Background processing for an import job.
 */
async function processImportJob(
  jobId: string,
  creatorId: string,
  fileName: string,
  content: string,
  source: ImportSource
): Promise<void> {
  // Update status to processing
  db.prepare("UPDATE import_jobs SET status = 'processing' WHERE id = ?").run(jobId);

  // Step 1: Parse
  const { conversations } = parseExport(fileName, content, source);

  const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
  db.prepare(
    "UPDATE import_jobs SET total_conversations = ?, total_messages = ? WHERE id = ?"
  ).run(conversations.length, totalMessages, jobId);

  if (conversations.length === 0) {
    db.prepare(
      "UPDATE import_jobs SET status = 'complete', signals_found = 0, completed_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), jobId);
    return;
  }

  // Step 2: Extract signals in batches of 10
  const batchSize = 10;
  const allSignals: Array<{
    type: string;
    content: string;
    raw_quote: string;
    conversation_id: string;
    message_index: number;
    suggested_domain: string;
    suggested_topic: string;
    suggested_load_for: string[];
    confidence: number;
  }> = [];

  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);
    try {
      const signals = await extractSignals(batch);
      allSignals.push(...signals);
    } catch (err) {
      console.error(`Extraction batch failed:`, err);
    }
  }

  // Step 3: Security scan extracted signals
  const cleanSignals = allSignals.filter((signal) => {
    // Check for injection in extracted content
    const injection = detectInjection(signal.content);
    if (injection.detected) {
      logSecurityEvent("extraction_output_injection", {
        signal_type: signal.type,
        patterns: injection.patterns,
        confidence: injection.confidence,
      }, { creator_id: creatorId });
      return false; // Skip this signal
    }

    // Check for PII hard blocks
    if (quickPIICheck(signal.content)) {
      logSecurityEvent("pii_soft_flag", {
        signal_type: signal.type,
        preview: signal.content.slice(0, 100),
      }, { creator_id: creatorId });
      // Soft flag: still include, but note it for review
    }

    return true;
  });

  db.prepare("UPDATE import_jobs SET signals_found = ? WHERE id = ?").run(cleanSignals.length, jobId);

  // Step 3b: Store signals
  const now = new Date().toISOString();
  const insertSignal = db.prepare(`
    INSERT INTO import_signals
    (id, job_id, creator_id, signal_type, content, raw_quote, source_conversation_id,
     source_message_index, context, suggested_file, suggested_load_for, confidence, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `);

  const signalIds: string[] = [];
  for (const signal of cleanSignals) {
    const signalId = uuid();
    signalIds.push(signalId);
    const suggestedFile = `${signal.suggested_domain}/${signal.suggested_topic}.md`;
    insertSignal.run(
      signalId,
      jobId,
      creatorId,
      signal.type,
      signal.content,
      signal.raw_quote || "",
      signal.conversation_id || "",
      signal.message_index || 0,
      "", // context
      suggestedFile,
      (signal.suggested_load_for || []).join(", "),
      signal.confidence,
      now
    );
  }

  // Step 4: Generate draft files from signal clusters
  const pendingSignals = db
    .prepare("SELECT * FROM import_signals WHERE job_id = ? AND status = 'pending'")
    .all(jobId) as any[];

  if (pendingSignals.length >= 2) {
    const drafts = await generateDraftFiles(
      pendingSignals.map((s) => ({
        id: s.id,
        signal_type: s.signal_type,
        content: s.content,
        suggested_file: s.suggested_file,
        suggested_load_for: s.suggested_load_for,
      })),
      creatorId
    );

    const insertDraft = db.prepare(`
      INSERT INTO import_draft_files (id, job_id, creator_id, filepath, load_for, content, signal_ids, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `);

    for (const draft of drafts) {
      insertDraft.run(
        uuid(),
        jobId,
        creatorId,
        draft.filepath,
        draft.load_for,
        draft.content,
        JSON.stringify(draft.signal_ids)
      );
    }

    db.prepare("UPDATE import_jobs SET draft_files_created = ? WHERE id = ?").run(drafts.length, jobId);
  }

  // Step 5: Mark complete
  db.prepare(
    "UPDATE import_jobs SET status = 'review', completed_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), jobId);
}

/**
 * GET /:jobId/status — Get import job status
 */
router.get("/:jobId/status", requireAuth(), (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const creator = (req as any).creator;

    const job = db.prepare(
      "SELECT * FROM import_jobs WHERE id = ? AND creator_id = ?"
    ).get(jobId, creator.id) as any;

    if (!job) return res.status(404).json({ error: "Job not found" });

    res.json({
      id: job.id,
      status: job.status,
      source: job.source,
      file_name: job.file_name,
      total_conversations: job.total_conversations,
      total_messages: job.total_messages,
      signals_found: job.signals_found,
      draft_files_created: job.draft_files_created,
      error: job.error,
      created_at: job.created_at,
      completed_at: job.completed_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET / — List all import jobs for current creator
 */
router.get("/", requireAuth(), (req: Request, res: Response) => {
  try {
    const creator = (req as any).creator;
    const jobs = db.prepare(
      "SELECT * FROM import_jobs WHERE creator_id = ? ORDER BY created_at DESC LIMIT 50"
    ).all(creator.id);

    res.json({ jobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /:jobId/signals — Get signals for a job
 */
router.get("/:jobId/signals", requireAuth(), (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const creator = (req as any).creator;
    const status = req.query.status as string;
    const type = req.query.type as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    // Verify ownership
    const job = db.prepare(
      "SELECT id FROM import_jobs WHERE id = ? AND creator_id = ?"
    ).get(jobId, creator.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    let query = "SELECT * FROM import_signals WHERE job_id = ?";
    const params: any[] = [jobId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    if (type) {
      query += " AND signal_type = ?";
      params.push(type);
    }

    query += " ORDER BY confidence DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const signals = db.prepare(query).all(...params);
    const total = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM import_signals WHERE job_id = ?${status ? " AND status = ?" : ""}${type ? " AND signal_type = ?" : ""}`
      )
      .get(...[jobId, ...(status ? [status] : []), ...(type ? [type] : [])]) as any;

    res.json({ signals, total: total?.cnt || 0, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /signals/:signalId — Update a signal (approve/reject/edit)
 */
router.patch("/signals/:signalId", requireAuth(), (req: Request, res: Response) => {
  try {
    const { signalId } = req.params;
    const { status, edited_content, load_for } = req.body;
    const creator = (req as any).creator;

    const signal = db.prepare(
      "SELECT s.*, j.creator_id FROM import_signals s JOIN import_jobs j ON s.job_id = j.id WHERE s.id = ? AND j.creator_id = ?"
    ).get(signalId, creator.id) as any;

    if (!signal) return res.status(404).json({ error: "Signal not found" });

    const updates: string[] = [];
    const values: any[] = [];

    if (status) {
      updates.push("status = ?");
      values.push(status);
      if (status === "approved" || status === "rejected") {
        updates.push("reviewed_at = ?");
        values.push(new Date().toISOString());
      }
    }
    if (edited_content !== undefined) {
      updates.push("edited_content = ?");
      values.push(edited_content);
      if (!status) {
        updates.push("status = 'edited'");
      }
    }
    if (load_for !== undefined) {
      updates.push("suggested_load_for = ?");
      values.push(load_for);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    values.push(signalId);
    db.prepare(`UPDATE import_signals SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /:jobId/drafts — Get draft files for a job
 */
router.get("/:jobId/drafts", requireAuth(), (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const creator = (req as any).creator;

    const job = db.prepare(
      "SELECT id FROM import_jobs WHERE id = ? AND creator_id = ?"
    ).get(jobId, creator.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const drafts = db.prepare(
      "SELECT * FROM import_draft_files WHERE job_id = ? ORDER BY filepath"
    ).all(jobId);

    res.json({ drafts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /drafts/:draftId — Update a draft file
 */
router.patch("/drafts/:draftId", requireAuth(), (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    const { content, status, filepath, load_for } = req.body;
    const creator = (req as any).creator;

    const draft = db.prepare(
      "SELECT d.*, j.creator_id FROM import_draft_files d JOIN import_jobs j ON d.job_id = j.id WHERE d.id = ? AND j.creator_id = ?"
    ).get(draftId, creator.id) as any;

    if (!draft) return res.status(404).json({ error: "Draft not found" });

    const updates: string[] = [];
    const values: any[] = [];

    if (content !== undefined) {
      updates.push("content = ?");
      values.push(content);
    }
    if (status) {
      updates.push("status = ?");
      values.push(status);
      if (status === "approved") {
        updates.push("approved_at = ?");
        values.push(new Date().toISOString());
      }
    }
    if (filepath !== undefined) {
      updates.push("filepath = ?");
      values.push(filepath);
    }
    if (load_for !== undefined) {
      updates.push("load_for = ?");
      values.push(load_for);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    values.push(draftId);
    db.prepare(`UPDATE import_draft_files SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:jobId/publish — Publish approved drafts to creator's Mindset
 */
router.post("/:jobId/publish", requireAuth(), async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { mindset_id } = req.body;
    const creator = (req as any).creator;

    const job = db.prepare(
      "SELECT id FROM import_jobs WHERE id = ? AND creator_id = ?"
    ).get(jobId, creator.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (!mindset_id) {
      return res.status(400).json({ error: "mindset_id required" });
    }

    // Verify mindset belongs to this creator
    const mindset = db.prepare(
      "SELECT * FROM mindsets WHERE id = ? AND creator_handle = ?"
    ).get(mindset_id, creator.handle) as any;
    if (!mindset) return res.status(404).json({ error: "Mindset not found" });

    // Get approved drafts
    const drafts = db.prepare(
      "SELECT * FROM import_draft_files WHERE job_id = ? AND status = 'approved'"
    ).all(jobId) as any[];

    if (drafts.length === 0) {
      return res.status(400).json({ error: "No approved drafts to publish" });
    }

    // Import storage functions
    const { storeMindsetFile, contentHash } = await import("../mindsets/storage");

    const now = new Date().toISOString();
    let filesCreated = 0;

    for (const draft of drafts) {
      // Store file
      await storeMindsetFile(creator.handle, mindset.slug, draft.filepath, draft.content);

      // Upsert mindset_files record
      const existing = db.prepare(
        "SELECT id FROM mindset_files WHERE mindset_id = ? AND filepath = ?"
      ).get(mindset_id, draft.filepath) as any;

      if (existing) {
        db.prepare(`
          UPDATE mindset_files SET content = ?, load_for = ?, size_bytes = ?, content_hash = ?, updated_at = ? WHERE id = ?
        `).run(draft.content, draft.load_for, Buffer.byteLength(draft.content), contentHash(draft.content), now, existing.id);
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

      filesCreated++;
    }

    // Bump version
    const versionParts = (mindset.version || "1.0.0").split(".").map(Number);
    versionParts[2] = (versionParts[2] || 0) + 1;
    const newVersion = versionParts.join(".");

    const fileCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM mindset_files WHERE mindset_id = ?"
    ).get(mindset_id) as any).cnt;

    db.prepare(
      "UPDATE mindsets SET version = ?, file_count = ?, last_updated_at = ? WHERE id = ?"
    ).run(newVersion, fileCount, now, mindset_id);

    // Mark job complete
    db.prepare("UPDATE import_jobs SET status = 'complete' WHERE id = ?").run(jobId);

    res.json({
      success: true,
      files_created: filesCreated,
      version: newVersion,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /:jobId — Delete an import job and all associated data
 */
router.delete("/:jobId", requireAuth(), (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const creator = (req as any).creator;

    const job = db.prepare(
      "SELECT id FROM import_jobs WHERE id = ? AND creator_id = ?"
    ).get(jobId, creator.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    db.prepare("DELETE FROM import_draft_files WHERE job_id = ?").run(jobId);
    db.prepare("DELETE FROM import_signals WHERE job_id = ?").run(jobId);
    db.prepare("DELETE FROM import_jobs WHERE id = ?").run(jobId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
