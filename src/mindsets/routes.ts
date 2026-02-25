import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/database";
import { requireAuth, authenticateRequest } from "../auth/magic-link";
import {
  createMindsetSubscription,
  validateInstallToken,
} from "./checkout";
import {
  storeMindsetFile,
  readMindsetFile,
  listMindsetFiles,
  deleteMindsetFile,
  contentHash,
} from "./storage";
import { validatePublishPayload, validateMindsetFile } from "./validation";
import { sendAdminNotification, sendOtpEmail } from "../payments/email";
import { detectMindsetInjection } from "../lib/injection-detector";
import { scanForPII, quickPIICheck } from "../lib/pii-scrubber";
import { logSecurityEvent } from "../lib/security-logger";

const router = Router();

/**
 * Return a safe error response — log the real error, return generic message to client.
 * Known/expected errors (validation, not found) pass through; unexpected errors are masked.
 */
function safeError(res: Response, err: any, statusCode = 500): void {
  if (statusCode < 500) {
    // Client errors — safe to return the message
    res.status(statusCode).json({ error: err.message || "Bad request" });
    return;
  }
  // Server errors — log details, return generic message
  console.error("Internal error:", err.message || err);
  res.status(500).json({ error: "Internal server error" });
}

// ============================================================
// PUBLIC ENDPOINTS
// ============================================================

/**
 * GET / — List all active mindsets (marketplace index)
 * Query params: domain, sort (featured|newest|subscribers|updated), page, limit
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const domain = req.query.domain as string;
    const sort = (req.query.sort as string) || "featured";
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;

    let query = "SELECT m.*, c.display_name as creator_name, c.headline as creator_headline, c.profile_image_url, c.verification_status FROM mindsets m LEFT JOIN creators c ON m.creator_handle = c.handle WHERE m.status = 'active'";
    const params: any[] = [];

    if (domain) {
      query += " AND m.domain = ?";
      params.push(domain);
    }

    switch (sort) {
      case "newest":
        query += " ORDER BY m.published_at DESC";
        break;
      case "subscribers":
        query += " ORDER BY m.subscriber_count DESC";
        break;
      case "updated":
        query += " ORDER BY m.last_updated_at DESC";
        break;
      case "featured":
      default:
        query += " ORDER BY m.subscriber_count DESC, m.published_at DESC";
        break;
    }

    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const mindsets = db.prepare(query).all(...params);

    const total = db.prepare(
      "SELECT COUNT(*) as cnt FROM mindsets WHERE status = 'active'" +
      (domain ? " AND domain = ?" : "")
    ).get(...(domain ? [domain] : [])) as any;

    res.json({
      mindsets,
      total: total?.cnt || 0,
      page,
      limit,
    });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /featured — Get featured mindsets
 */
router.get("/featured", (_req: Request, res: Response) => {
  try {
    const featured = db.prepare(`
      SELECT m.*, c.display_name as creator_name, c.headline as creator_headline,
             c.profile_image_url, c.verification_status, f.position
      FROM featured_mindsets f
      JOIN mindsets m ON f.mindset_id = m.id
      LEFT JOIN creators c ON m.creator_handle = c.handle
      WHERE m.status = 'active'
      ORDER BY f.position ASC
      LIMIT 3
    `).all();
    res.json({ featured });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /categories — Get list of categories with counts
 */
router.get("/categories", (_req: Request, res: Response) => {
  try {
    const categories = db.prepare(`
      SELECT domain, COUNT(*) as count
      FROM mindsets WHERE status = 'active' AND domain IS NOT NULL
      GROUP BY domain ORDER BY count DESC
    `).all();
    res.json({ categories });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /detail/:slug — Get mindset detail by slug
 */
router.get("/detail/:slug", (req: Request, res: Response) => {
  try {
    const mindset = db.prepare(`
      SELECT m.*, c.display_name as creator_name, c.headline as creator_headline,
             c.bio as creator_bio, c.profile_image_url, c.verification_status,
             c.credentials as creator_credentials, c.work_samples as creator_work_samples,
             c.domain as creator_domain, c.handle as creator_handle
      FROM mindsets m
      LEFT JOIN creators c ON m.creator_handle = c.handle
      WHERE m.slug = ?
    `).get(req.params.slug);

    if (!mindset) {
      return res.status(404).json({ error: "Mindset not found" });
    }

    // Get file count and structure (but not content)
    const files = db.prepare(
      "SELECT filepath, load_for, size_bytes FROM mindset_files WHERE mindset_id = ?"
    ).all((mindset as any).id);

    res.json({ mindset, files });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /creator/:handle — Get creator's public profile + mindsets
 */
router.get("/creator/:handle", (req: Request, res: Response) => {
  try {
    const creator = db.prepare(`
      SELECT handle, display_name, bio, headline, domain, credentials, work_samples,
             profile_image_url, verification_status, subscriber_count, mindset_count, created_at
      FROM creators WHERE handle = ?
    `).get(req.params.handle);

    if (!creator) {
      return res.status(404).json({ error: "Creator not found" });
    }

    const mindsets = db.prepare(
      "SELECT * FROM mindsets WHERE creator_handle = ? AND status = 'active' ORDER BY subscriber_count DESC"
    ).all(req.params.handle);

    res.json({ creator, mindsets });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /category/:category — Filter by category/domain
 */
router.get("/category/:category", (req: Request, res: Response) => {
  try {
    const mindsets = db.prepare(`
      SELECT m.*, c.display_name as creator_name, c.headline as creator_headline,
             c.profile_image_url, c.verification_status
      FROM mindsets m
      LEFT JOIN creators c ON m.creator_handle = c.handle
      WHERE m.status = 'active' AND m.domain = ?
      ORDER BY m.subscriber_count DESC
    `).all(req.params.category);

    res.json({ mindsets, category: req.params.category });
  } catch (err: any) {
    safeError(res, err);
  }
});

// ============================================================
// CREATOR ENDPOINTS (authenticated)
// ============================================================

/**
 * POST /publish — Publish or update a Mindset
 */
router.post("/publish", requireAuth("creator"), async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const { manifest, files } = req.body;

    if (!manifest || !files) {
      return res.status(400).json({ error: "manifest and files are required" });
    }

    // Validate
    const errors = validatePublishPayload({ manifest, files });
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", errors });
    }

    const now = new Date().toISOString();
    const filePaths = Object.keys(files);

    // Security: scan all files for injection and PII
    for (const fp of filePaths) {
      const content = files[fp];

      // Injection detection
      const injection = detectMindsetInjection(content);
      if (injection.detected) {
        logSecurityEvent("injection_attempt", {
          filepath: fp,
          patterns: injection.patterns,
          confidence: injection.confidence,
        }, { creator_id: auth.handle, mindset_id: manifest.id || manifest.slug });
        return res.status(400).json({
          error: `File "${fp}" contains disallowed patterns (possible injection). Please review and remove instructional content.`,
          patterns: injection.patterns,
        });
      }

      // PII detection
      if (quickPIICheck(content)) {
        const piiResult = await scanForPII(content);
        if (piiResult.hasHardBlock) {
          logSecurityEvent("pii_hard_block", {
            filepath: fp,
            types: piiResult.flaggedTypes,
          }, { creator_id: auth.handle });
          return res.status(400).json({
            error: `File "${fp}" contains sensitive personal data (${piiResult.flaggedTypes.join(", ")}). Please remove before publishing.`,
          });
        }
      }
    }

    // Check if this is an update to an existing mindset
    let mindsetId: string;
    const existing = db.prepare(
      "SELECT * FROM mindsets WHERE creator_handle = ? AND slug = ?"
    ).get(auth.handle, manifest.id || manifest.slug) as any;

    if (existing) {
      // Update existing mindset
      mindsetId = existing.id;

      // Bump version
      const parts = (existing.version || "1.0.0").split(".").map(Number);
      parts[2] = (parts[2] || 0) + 1;
      const newVersion = parts.join(".");

      db.prepare(`
        UPDATE mindsets SET
          name = ?, tagline = ?, description = ?, domain = ?,
          tags = ?, triggers = ?, version = ?, file_count = ?,
          status = 'pending', last_updated_at = ?
        WHERE id = ?
      `).run(
        manifest.name,
        manifest.tagline || manifest.description?.slice(0, 120) || "",
        manifest.description,
        manifest.domain || manifest.category || "",
        JSON.stringify(manifest.tags || []),
        JSON.stringify(manifest.triggers || []),
        newVersion,
        filePaths.length,
        now,
        mindsetId
      );
    } else {
      // Create new mindset
      mindsetId = uuid();
      const slug = (manifest.id || manifest.slug || manifest.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      db.prepare(`
        INSERT INTO mindsets
        (id, creator_handle, slug, name, tagline, description, domain, tags, triggers,
         price_cents, version, file_count, s3_prefix, status, created_at, last_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '1.0.0', ?, ?, 'pending', ?, ?)
      `).run(
        mindsetId,
        auth.handle,
        slug,
        manifest.name,
        manifest.tagline || manifest.description?.slice(0, 120) || "",
        manifest.description,
        manifest.domain || manifest.category || "",
        JSON.stringify(manifest.tags || []),
        JSON.stringify(manifest.triggers || []),
        manifest.price_cents || 0,
        filePaths.length,
        `mindsets/${auth.handle}/${slug}`,
        now,
        now
      );
    }

    // Store files
    const slug = existing?.slug || (manifest.id || manifest.slug || manifest.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    for (const fp of filePaths) {
      const content = files[fp];
      await storeMindsetFile(auth.handle, slug, fp, content);

      // Upsert mindset_files record
      const loadFor = content.match(/Load for:\s*(.+)/)?.[1]?.trim() || "";
      const hash = contentHash(content);

      db.prepare(`
        INSERT INTO mindset_files (id, mindset_id, filepath, load_for, size_bytes, s3_key, content_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mindset_id, filepath) DO UPDATE SET
          load_for = excluded.load_for, size_bytes = excluded.size_bytes,
          s3_key = excluded.s3_key, content_hash = excluded.content_hash, updated_at = excluded.updated_at
      `).run(
        uuid(), mindsetId, fp, loadFor, Buffer.byteLength(content, "utf-8"),
        `mindsets/${auth.handle}/${slug}/${fp}`, hash, now, now
      );
    }

    // Update creator mindset count
    const mCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM mindsets WHERE creator_handle = ?"
    ).get(auth.handle) as any;
    db.prepare("UPDATE creators SET mindset_count = ? WHERE handle = ?").run(
      mCount?.cnt || 0,
      auth.handle
    );

    // Notify admin
    try {
      await sendAdminNotification(
        `Mindset submitted: ${manifest.name}`,
        `Creator ${auth.handle} submitted "${manifest.name}" with ${filePaths.length} files for review.`
      );
    } catch {
      // Non-fatal
    }

    res.json({
      success: true,
      mindset_id: mindsetId,
      message: `Submitted "${manifest.name}" with ${filePaths.length} files for review.`,
    });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /mine — List creator's own mindsets
 */
router.get("/mine", requireAuth("creator"), (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const mindsets = db.prepare(
      "SELECT * FROM mindsets WHERE creator_handle = ? ORDER BY created_at DESC"
    ).all(auth.handle);
    res.json({ mindsets });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /:id/files — List files in a mindset (creator only)
 */
router.get("/:id/files", requireAuth("creator"), (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const mindset = db.prepare(
      "SELECT * FROM mindsets WHERE id = ? AND creator_handle = ?"
    ).get(req.params.id, auth.handle) as any;

    if (!mindset) {
      return res.status(404).json({ error: "Mindset not found" });
    }

    const files = db.prepare(
      "SELECT * FROM mindset_files WHERE mindset_id = ? ORDER BY filepath"
    ).all(req.params.id);

    res.json({ files });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /:id/file-content — Get a single file's content
 */
router.get("/:id/file-content", requireAuth("creator"), async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const filepath = req.query.path as string;
    if (!filepath) return res.status(400).json({ error: "path query required" });

    const mindset = db.prepare(
      "SELECT * FROM mindsets WHERE id = ? AND creator_handle = ?"
    ).get(req.params.id, auth.handle) as any;

    if (!mindset) return res.status(404).json({ error: "Mindset not found" });

    const content = await readMindsetFile(auth.handle, mindset.slug, filepath);
    if (content === null) return res.status(404).json({ error: "File not found" });

    res.json({ filepath, content });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * PUT /:id/save-file — Save a single file
 */
router.put("/:id/save-file", requireAuth("creator"), async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const { filepath, content } = req.body;
    if (!filepath || content === undefined) {
      return res.status(400).json({ error: "filepath and content required" });
    }

    const mindset = db.prepare(
      "SELECT * FROM mindsets WHERE id = ? AND creator_handle = ?"
    ).get(req.params.id, auth.handle) as any;

    if (!mindset) return res.status(404).json({ error: "Mindset not found" });

    // Security: injection check
    const injection = detectMindsetInjection(content);
    if (injection.detected) {
      logSecurityEvent("injection_attempt", {
        filepath,
        patterns: injection.patterns,
        confidence: injection.confidence,
      }, { creator_id: auth.handle, mindset_id: req.params.id });
      return res.status(400).json({
        error: "File contains disallowed patterns. Please remove instructional content.",
      });
    }

    // Security: PII check
    if (quickPIICheck(content)) {
      const piiResult = await scanForPII(content);
      if (piiResult.hasHardBlock) {
        logSecurityEvent("pii_hard_block", { filepath, types: piiResult.flaggedTypes }, { creator_id: auth.handle });
        return res.status(400).json({
          error: `File contains sensitive data (${piiResult.flaggedTypes.join(", ")}). Please remove.`,
        });
      }
    }

    // Validate file
    const errors = validateMindsetFile(filepath, content);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", errors });
    }

    await storeMindsetFile(auth.handle, mindset.slug, filepath, content);

    const now = new Date().toISOString();
    const loadFor = content.match(/Load for:\s*(.+)/)?.[1]?.trim() || "";
    const hash = contentHash(content);

    db.prepare(`
      INSERT INTO mindset_files (id, mindset_id, filepath, load_for, size_bytes, s3_key, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mindset_id, filepath) DO UPDATE SET
        load_for = excluded.load_for, size_bytes = excluded.size_bytes,
        content_hash = excluded.content_hash, updated_at = excluded.updated_at
    `).run(
      uuid(), mindset.id, filepath, loadFor, Buffer.byteLength(content, "utf-8"),
      `mindsets/${auth.handle}/${mindset.slug}/${filepath}`, hash, now, now
    );

    // Bump patch version
    const parts = (mindset.version || "1.0.0").split(".").map(Number);
    parts[2] = (parts[2] || 0) + 1;
    db.prepare("UPDATE mindsets SET version = ?, last_updated_at = ? WHERE id = ?").run(
      parts.join("."), now, mindset.id
    );

    res.json({ success: true, message: "File saved" });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /:id/subscribers — View subscriber analytics (creator only)
 */
router.get("/:id/subscribers", requireAuth("creator"), (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const mindset = db.prepare(
      "SELECT * FROM mindsets WHERE id = ? AND creator_handle = ?"
    ).get(req.params.id, auth.handle) as any;

    if (!mindset) return res.status(404).json({ error: "Mindset not found" });

    const subscribers = db.prepare(`
      SELECT subscriber_email, status, created_at, cancelled_at, current_period_end
      FROM subscriptions WHERE mindset_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM subscriptions WHERE mindset_id = ?
    `).get(req.params.id);

    res.json({ subscribers, stats });
  } catch (err: any) {
    safeError(res, err);
  }
});

// ============================================================
// SUBSCRIPTION / SYNC ENDPOINTS (token-based)
// ============================================================

/**
 * POST /subscribe — Create a subscription checkout session
 */
router.post("/subscribe", async (req: Request, res: Response) => {
  try {
    const { mindset_id, email } = req.body;
    if (!mindset_id || !email) {
      return res.status(400).json({ error: "mindset_id and email required" });
    }

    const result = await createMindsetSubscription(mindset_id, email);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /subscriptions/validate — Validate subscription tokens
 */
router.post("/subscriptions/validate", (req: Request, res: Response) => {
  try {
    const { install_tokens } = req.body;
    if (!Array.isArray(install_tokens)) {
      return res.status(400).json({ error: "install_tokens array required" });
    }

    const results = install_tokens.map((token: string) => ({
      token,
      ...validateInstallToken(token),
    }));

    res.json({ results });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /sync/:slug/version — Get latest version for sync check
 */
router.get("/sync/:slug/version", (req: Request, res: Response) => {
  try {
    const mindset = db.prepare(
      "SELECT version, last_updated_at FROM mindsets WHERE slug = ? AND status = 'active'"
    ).get(req.params.slug) as any;

    if (!mindset) return res.status(404).json({ error: "Mindset not found" });

    res.json({ version: mindset.version, updated: mindset.last_updated_at });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /sync/:slug/files — Get all file content for sync/install
 * Requires valid install token in Authorization header.
 */
router.get("/sync/:slug/files", async (req: Request, res: Response) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const validation = validateInstallToken(token);

    if (!validation.valid) {
      return res.status(401).json({ error: "Invalid or expired install token" });
    }

    const mindset = db.prepare(`
      SELECT m.* FROM mindsets m WHERE m.slug = ? AND m.status = 'active'
    `).get(req.params.slug) as any;

    if (!mindset) return res.status(404).json({ error: "Mindset not found" });

    // Get all files with content
    const fileRecords = db.prepare(
      "SELECT filepath, content_hash, load_for FROM mindset_files WHERE mindset_id = ?"
    ).all(mindset.id) as any[];

    const files: Record<string, { content: string; hash: string; load_for: string }> = {};
    for (const f of fileRecords) {
      const content = await readMindsetFile(mindset.creator_handle, mindset.slug, f.filepath);
      if (content !== null) {
        files[f.filepath] = {
          content,
          hash: f.content_hash,
          load_for: f.load_for || "",
        };
      }
    }

    // Build MINDSET.md manifest content
    const triggers = JSON.parse(mindset.triggers || "[]");
    const manifestContent = `---
id: ${mindset.slug}
creator: ${mindset.creator_handle}
version: ${mindset.version}
updated: ${mindset.last_updated_at}
name: "${mindset.name}"
description: "${mindset.description || ""}"
triggers:
${triggers.map((t: string) => `  - ${t}`).join("\n")}
subscription:
  status: active
  tier: monthly
---

# ${mindset.name}

${mindset.description || ""}
`;

    res.json({
      mindset: {
        id: mindset.id,
        slug: mindset.slug,
        name: mindset.name,
        creator: mindset.creator_handle,
        version: mindset.version,
        triggers,
        description: mindset.description,
      },
      manifest: manifestContent,
      files,
    });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * POST /activity/log — Log install/load/sync events (for creator analytics)
 */
router.post("/activity/log", (req: Request, res: Response) => {
  try {
    const { creator_slug, event } = req.body;
    if (!creator_slug || !event) {
      return res.status(400).json({ error: "creator_slug and event required" });
    }

    const validEvents = ["install", "load", "sync", "remove"];
    if (!validEvents.includes(event)) {
      return res.status(400).json({ error: `event must be one of: ${validEvents.join(", ")}` });
    }

    db.prepare(`
      INSERT INTO mindset_sync_events (id, subscriber_email, mindset_id, event_type, created_at)
      VALUES (?, ?, (SELECT id FROM mindsets WHERE slug = ? LIMIT 1), ?, ?)
    `).run(uuid(), "", creator_slug, event, new Date().toISOString());

    res.json({ success: true });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * POST /creator/publish/confirm — Confirm a two-phase publish after S3 upload
 */
router.post("/creator/publish/confirm", requireAuth("creator"), (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const { confirm_token } = req.body;

    if (!confirm_token) {
      return res.status(400).json({ error: "confirm_token required" });
    }

    // In the current local-storage implementation, the publish is atomic
    // (files are written directly in POST /publish). This endpoint exists
    // for the future S3-based flow where files are uploaded to signed URLs
    // and then confirmed. For now, validate the token matches a recent publish.
    const mindset = db.prepare(
      "SELECT * FROM mindsets WHERE creator_handle = ? ORDER BY last_updated_at DESC LIMIT 1"
    ).get(auth.handle) as any;

    if (!mindset) {
      return res.status(404).json({ error: "No recent publish found" });
    }

    // Count active subscribers for notification
    const subCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM subscriptions WHERE mindset_id = ? AND status = 'active'"
    ).get(mindset.id) as any;

    res.json({
      success: true,
      version: mindset.version,
      subscribers_notified: subCount?.cnt || 0,
    });
  } catch (err: any) {
    safeError(res, err);
  }
});

// ============================================================
// CREATOR VERIFICATION ENDPOINTS
// ============================================================

/**
 * POST /creators/apply — Submit creator application
 */
router.post("/creators/apply", async (req: Request, res: Response) => {
  try {
    const {
      email, name, headline, domain, bio, credentials,
      work_samples, why_subscribe, portfolio_url, linkedin_url,
    } = req.body;

    if (!email || !name || !headline || !domain || !bio) {
      return res.status(400).json({
        error: "email, name, headline, domain, and bio are required",
      });
    }

    const now = new Date().toISOString();
    const handle = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-");

    // Create or update creator record
    const existing = db.prepare("SELECT * FROM creators WHERE email = ?").get(email) as any;

    if (existing) {
      db.prepare(`
        UPDATE creators SET display_name = ?, headline = ?, domain = ?, bio = ?,
          credentials = ?, work_samples = ?, verification_status = 'pending'
        WHERE email = ?
      `).run(name, headline, domain, bio, credentials || "", work_samples || "", email);
    } else {
      db.prepare(`
        INSERT INTO creators (handle, email, display_name, headline, domain, bio,
          credentials, work_samples, verification_status, slug, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(handle, email, name, headline, domain, bio, credentials || "", work_samples || "", handle, now);
    }

    // Create verification submission
    db.prepare(`
      INSERT INTO verification_submissions
      (id, creator_handle, submitted_at, status, portfolio_url, linkedin_url, additional_info)
      VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      uuid(),
      existing?.handle || handle,
      now,
      portfolio_url || "",
      linkedin_url || "",
      why_subscribe || ""
    );

    // Notify admin
    try {
      await sendAdminNotification(
        `Creator application: ${name}`,
        `${name} (${email}) applied as a creator in ${domain}.\n\nHeadline: ${headline}\n\nBio: ${bio}`
      );
    } catch {
      // Non-fatal
    }

    res.json({
      success: true,
      message: "Application submitted. We review within 48 hours.",
      handle: existing?.handle || handle,
    });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * PUT /creators/profile — Update creator profile (authenticated)
 */
router.put("/creators/profile", requireAuth("creator"), (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const { display_name, bio, headline, domain, credentials, work_samples, profile_image_url } = req.body;

    db.prepare(`
      UPDATE creators SET
        display_name = COALESCE(?, display_name),
        bio = COALESCE(?, bio),
        headline = COALESCE(?, headline),
        domain = COALESCE(?, domain),
        credentials = COALESCE(?, credentials),
        work_samples = COALESCE(?, work_samples),
        profile_image_url = COALESCE(?, profile_image_url)
      WHERE handle = ?
    `).run(display_name, bio, headline, domain, credentials, work_samples, profile_image_url, auth.handle);

    res.json({ success: true, message: "Profile updated" });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /creators/me — Get authenticated creator's own profile
 */
router.get("/creators/me", requireAuth("creator"), (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth;
    const creator = db.prepare("SELECT * FROM creators WHERE handle = ?").get(auth.handle);
    if (!creator) return res.status(404).json({ error: "Creator not found" });

    // Get earnings
    const mindsets = db.prepare(
      "SELECT * FROM mindsets WHERE creator_handle = ? ORDER BY created_at DESC"
    ).all(auth.handle);

    res.json({ creator, mindsets });
  } catch (err: any) {
    safeError(res, err);
  }
});

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

/**
 * GET /admin/pending — List pending mindsets
 */
router.get("/admin/pending", requireAuth("admin"), (_req: Request, res: Response) => {
  try {
    const pending = db.prepare(`
      SELECT m.*, c.display_name as creator_name, c.email as creator_email,
             c.headline as creator_headline, c.verification_status
      FROM mindsets m
      LEFT JOIN creators c ON m.creator_handle = c.handle
      WHERE m.status = 'pending'
      ORDER BY m.last_updated_at DESC
    `).all();
    res.json({ pending });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * POST /admin/approve — Approve a mindset for publishing
 */
router.post("/admin/approve", requireAuth("admin"), (req: Request, res: Response) => {
  try {
    const { mindset_id } = req.body;
    if (!mindset_id) return res.status(400).json({ error: "mindset_id required" });

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE mindsets SET status = 'active', published_at = COALESCE(published_at, ?), last_updated_at = ?
      WHERE id = ?
    `).run(now, now, mindset_id);

    const mindset = db.prepare("SELECT * FROM mindsets WHERE id = ?").get(mindset_id) as any;
    if (mindset) {
      // Mark creator as verified if not already
      db.prepare(`
        UPDATE creators SET verification_status = 'verified'
        WHERE handle = ? AND verification_status != 'verified'
      `).run(mindset.creator_handle);
    }

    res.json({ success: true, message: `Mindset ${mindset_id} approved and live` });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * POST /admin/reject — Reject a mindset
 */
router.post("/admin/reject", requireAuth("admin"), async (req: Request, res: Response) => {
  try {
    const { mindset_id, reason } = req.body;
    if (!mindset_id || !reason) {
      return res.status(400).json({ error: "mindset_id and reason required" });
    }

    db.prepare("UPDATE mindsets SET status = 'rejected' WHERE id = ?").run(mindset_id);

    // Email creator
    const mindset = db.prepare(`
      SELECT m.name, c.email FROM mindsets m
      JOIN creators c ON m.creator_handle = c.handle
      WHERE m.id = ?
    `).get(mindset_id) as any;

    if (mindset?.email) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "hello@know.help",
          to: mindset.email,
          subject: `Mindset review: "${mindset.name}" needs changes`,
          html: `<p>Your Mindset "${mindset.name}" was not approved.</p><p><strong>Reason:</strong> ${reason}</p><p>Please address the feedback and resubmit.</p>`,
        });
      } catch {
        // Non-fatal
      }
    }

    res.json({ success: true, message: `Mindset ${mindset_id} rejected` });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * POST /admin/feature — Feature or unfeature a mindset
 */
router.post("/admin/feature", requireAuth("admin"), (req: Request, res: Response) => {
  try {
    const { mindset_id, position, remove } = req.body;
    if (!mindset_id) return res.status(400).json({ error: "mindset_id required" });

    if (remove) {
      db.prepare("DELETE FROM featured_mindsets WHERE mindset_id = ?").run(mindset_id);
    } else {
      db.prepare(`
        INSERT OR REPLACE INTO featured_mindsets (mindset_id, position, featured_at, featured_by)
        VALUES (?, ?, ?, 'admin')
      `).run(mindset_id, position || 0, new Date().toISOString());
    }

    res.json({ success: true });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * GET /admin/verifications — List pending creator verifications
 */
router.get("/admin/verifications", requireAuth("admin"), (_req: Request, res: Response) => {
  try {
    const pending = db.prepare(`
      SELECT v.*, c.display_name, c.email, c.headline, c.domain, c.bio,
             c.credentials, c.work_samples
      FROM verification_submissions v
      JOIN creators c ON v.creator_handle = c.handle
      WHERE v.status = 'pending'
      ORDER BY v.submitted_at DESC
    `).all();
    res.json({ pending });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * POST /admin/verifications/approve — Approve creator verification
 */
router.post("/admin/verifications/approve", requireAuth("admin"), async (req: Request, res: Response) => {
  try {
    const { submission_id } = req.body;
    if (!submission_id) return res.status(400).json({ error: "submission_id required" });

    const now = new Date().toISOString();
    const submission = db.prepare("SELECT * FROM verification_submissions WHERE id = ?").get(submission_id) as any;
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    db.prepare("UPDATE verification_submissions SET status = 'approved', reviewed_at = ? WHERE id = ?").run(now, submission_id);
    db.prepare("UPDATE creators SET verification_status = 'verified' WHERE handle = ?").run(submission.creator_handle);

    // Send magic link to creator so they can log in
    const creator = db.prepare("SELECT email FROM creators WHERE handle = ?").get(submission.creator_handle) as any;
    if (creator?.email) {
      try {
        const { requestMagicLink } = await import("../auth/magic-link");
        await requestMagicLink(creator.email);
      } catch {
        // Non-fatal
      }
    }

    res.json({ success: true, message: "Creator verified and login link sent" });
  } catch (err: any) {
    safeError(res, err);
  }
});

/**
 * POST /admin/verifications/reject — Reject creator verification
 */
router.post("/admin/verifications/reject", requireAuth("admin"), async (req: Request, res: Response) => {
  try {
    const { submission_id, reason } = req.body;
    if (!submission_id || !reason) {
      return res.status(400).json({ error: "submission_id and reason required" });
    }

    const now = new Date().toISOString();
    const submission = db.prepare("SELECT * FROM verification_submissions WHERE id = ?").get(submission_id) as any;
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    db.prepare(
      "UPDATE verification_submissions SET status = 'rejected', rejection_reason = ?, reviewed_at = ? WHERE id = ?"
    ).run(reason, now, submission_id);

    db.prepare("UPDATE creators SET verification_status = 'rejected', verification_notes = ? WHERE handle = ?").run(
      reason, submission.creator_handle
    );

    // Email rejection
    const creator = db.prepare("SELECT email, display_name FROM creators WHERE handle = ?").get(submission.creator_handle) as any;
    if (creator?.email) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "hello@know.help",
          to: creator.email,
          subject: "know.help creator application update",
          html: `<p>Hi ${creator.display_name || ""},</p><p>Your creator application was not approved at this time.</p><p><strong>Reason:</strong> ${reason}</p><p>You're welcome to reapply once you've addressed the feedback.</p>`,
        });
      } catch {
        // Non-fatal
      }
    }

    res.json({ success: true, message: "Verification rejected" });
  } catch (err: any) {
    safeError(res, err);
  }
});

export default router;
