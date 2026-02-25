/**
 * Admin security API routes (Prompt 16).
 * Provides endpoints for the security dashboard.
 */

import { Router } from "express";
import { getSecurityEvents, getSecurityEventCounts } from "../lib/security-logger";

const router = Router();

/**
 * GET /api/admin/security/events
 * List security events with optional filters.
 */
router.get("/events", (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { type, severity, limit, since } = req.query;

  const events = getSecurityEvents({
    type: type as any,
    severity: severity as string,
    limit: limit ? parseInt(limit as string, 10) : 100,
    since: since as string,
  });

  return res.json({ events });
});

/**
 * GET /api/admin/security/counts
 * Aggregated event counts by type.
 */
router.get("/counts", (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
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
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const since = (req.query.since as string) || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const events = getSecurityEvents({ since, limit: 10000 });

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
