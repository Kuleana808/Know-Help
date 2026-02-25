/**
 * Admin security API routes (Prompt 16).
 * Provides endpoints for the security dashboard.
 */

import { Router } from "express";
import * as crypto from "crypto";
import { getSecurityEvents, getSecurityEventCounts } from "../lib/security-logger";

const router = Router();

/**
 * Timing-safe comparison for admin key to prevent timing attacks.
 */
function verifyAdminKey(provided: string | string[] | undefined): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !provided || typeof provided !== "string") return false;
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, "utf-8"),
      Buffer.from(expected, "utf-8")
    );
  } catch {
    return false;
  }
}

/**
 * GET /api/admin/security/events
 * List security events with optional filters.
 */
router.get("/events", (req, res) => {
  if (!verifyAdminKey(req.headers["x-admin-key"])) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { type, severity, limit, since } = req.query;

  const maxLimit = 500;
  const parsedLimit = limit ? Math.min(parseInt(limit as string, 10) || 100, maxLimit) : 100;

  const events = getSecurityEvents({
    type: type as any,
    severity: severity as string,
    limit: parsedLimit,
    since: since as string,
  });

  return res.json({ events });
});

/**
 * GET /api/admin/security/counts
 * Aggregated event counts by type.
 */
router.get("/counts", (req, res) => {
  if (!verifyAdminKey(req.headers["x-admin-key"])) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const since = (req.query.since as string) || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const counts = getSecurityEventCounts(since);

  return res.json({ counts, since });
});

/**
 * GET /api/admin/security/summary
 * Dashboard summary: totals by severity.
 */
router.get("/summary", (req, res) => {
  if (!verifyAdminKey(req.headers["x-admin-key"])) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const since = (req.query.since as string) || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const events = getSecurityEvents({ since, limit: 5000 });

  const summary = {
    total: events.length,
    critical: events.filter((e: any) => e.severity === "critical").length,
    high: events.filter((e: any) => e.severity === "high").length,
    medium: events.filter((e: any) => e.severity === "medium").length,
    low: events.filter((e: any) => e.severity === "low").length,
  };

  return res.json({ summary, since });
});

export default router;
