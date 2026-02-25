/**
 * Security event logging (Prompt 16).
 * Logs security-relevant events to the security_events table.
 */

import { v4 as uuid } from "uuid";
import db from "../db/database";

export type SecurityEventType =
  | "injection_attempt"
  | "injection_warning"
  | "extraction_output_injection"
  | "pii_hard_block"
  | "pii_soft_flag"
  | "path_traversal_attempt"
  | "file_integrity_failure"
  | "token_reuse_attempt"
  | "unauthorized_publish"
  | "rate_limit_exceeded"
  | "unauthorized_file_mutation";

const severityMap: Record<SecurityEventType, "low" | "medium" | "high" | "critical"> = {
  injection_attempt: "high",
  injection_warning: "medium",
  extraction_output_injection: "high",
  pii_hard_block: "high",
  pii_soft_flag: "medium",
  path_traversal_attempt: "critical",
  file_integrity_failure: "critical",
  token_reuse_attempt: "high",
  unauthorized_publish: "high",
  rate_limit_exceeded: "low",
  unauthorized_file_mutation: "critical",
};

interface SecurityEvent {
  type: SecurityEventType;
  creator_id?: string;
  mindset_id?: string;
  detail: Record<string, unknown>;
  severity: "low" | "medium" | "high" | "critical";
  timestamp: string;
}

export function logSecurityEvent(
  type: SecurityEventType,
  detail: Record<string, unknown>,
  options?: { creator_id?: string; mindset_id?: string; severity?: SecurityEvent["severity"] }
): void {
  try {
    const event: SecurityEvent = {
      type,
      detail,
      severity: options?.severity || severityMap[type] || "medium",
      creator_id: options?.creator_id,
      mindset_id: options?.mindset_id,
      timestamp: new Date().toISOString(),
    };

    db.prepare(
      "INSERT INTO security_events (id, type, creator_id, mindset_id, detail, severity, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      uuid(),
      event.type,
      event.creator_id || null,
      event.mindset_id || null,
      JSON.stringify(event.detail),
      event.severity,
      event.timestamp
    );

    // Critical events: log to console for immediate visibility
    if (event.severity === "critical") {
      console.error(`[SECURITY CRITICAL] ${event.type}:`, JSON.stringify(event.detail));
    }
  } catch (err) {
    // Security logging should never crash the app
    console.error("Failed to log security event:", err);
  }
}

/**
 * Get security events for admin dashboard.
 */
export function getSecurityEvents(options?: {
  type?: SecurityEventType;
  severity?: string;
  limit?: number;
  since?: string;
}): any[] {
  let query = "SELECT * FROM security_events WHERE 1=1";
  const params: any[] = [];

  if (options?.type) {
    query += " AND type = ?";
    params.push(options.type);
  }
  if (options?.severity) {
    query += " AND severity = ?";
    params.push(options.severity);
  }
  if (options?.since) {
    query += " AND timestamp > ?";
    params.push(options.since);
  }

  query += " ORDER BY timestamp DESC LIMIT ?";
  params.push(options?.limit || 100);

  return db.prepare(query).all(...params);
}

/**
 * Get event counts by type for the admin dashboard.
 */
export function getSecurityEventCounts(since: string): Record<string, number> {
  const rows = db.prepare(
    "SELECT type, COUNT(*) as cnt FROM security_events WHERE timestamp > ? GROUP BY type"
  ).all(since) as any[];

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.type] = row.cnt;
  }
  return counts;
}
