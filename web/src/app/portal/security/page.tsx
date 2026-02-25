"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

interface SecurityEvent {
  id: string;
  type: string;
  creator_id: string;
  mindset_id: string;
  detail: string;
  severity: string;
  timestamp: string;
}

export default function SecurityPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [eventsData, countsData] = await Promise.all([
        apiFetch<{ events: SecurityEvent[] }>("/api/admin/security/events?limit=50"),
        apiFetch<{ counts: Record<string, number> }>("/api/admin/security/counts"),
      ]);
      setEvents(eventsData.events || []);
      setCounts(countsData.counts || {});
    } catch {
      // Not admin
    } finally {
      setLoading(false);
    }
  }

  const severityColor: Record<string, string> = {
    critical: "text-red-600 bg-red-50 border-red-200",
    high: "text-orange-600 bg-orange-50 border-orange-200",
    medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
    low: "text-gray-500 bg-gray-50 border-gray-200",
  };

  const filtered = filter === "all"
    ? events
    : events.filter((e) => e.severity === filter);

  const totalEvents = Object.values(counts).reduce((a, b) => a + b, 0);

  if (loading) {
    return <div className="p-12"><p className="text-muted text-sm">Loading...</p></div>;
  }

  return (
    <div className="p-12 max-w-4xl">
      <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
        Admin
      </p>
      <h1 className="font-serif text-3xl mb-8">Security Dashboard</h1>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="card p-4 text-center">
          <div className="text-2xl font-serif">{totalEvents}</div>
          <div className="text-[10px] text-muted">Total events (7d)</div>
        </div>
        <div className="card p-4 text-center border-red-200">
          <div className="text-2xl font-serif text-red-600">{counts.critical || 0}</div>
          <div className="text-[10px] text-muted">Critical</div>
        </div>
        <div className="card p-4 text-center border-orange-200">
          <div className="text-2xl font-serif text-orange-600">{counts.high || 0}</div>
          <div className="text-[10px] text-muted">High</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-serif">{counts.medium || 0}</div>
          <div className="text-[10px] text-muted">Medium</div>
        </div>
      </div>

      {/* Event type breakdown */}
      <div className="card p-5 mb-8">
        <h3 className="font-serif text-base mb-3">Events by type</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(counts).map(([type, count]) => (
            <div key={type} className="flex justify-between text-xs py-1">
              <span className="font-mono text-muted">{type}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-4">
        {["all", "critical", "high", "medium", "low"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-[10px] px-3 py-1 border ${filter === s ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div className="space-y-2">
        {filtered.map((event) => (
          <div key={event.id} className={`border p-4 ${severityColor[event.severity] || ""}`}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-mono">{event.type}</span>
              <span className="text-[10px]">{new Date(event.timestamp).toLocaleString()}</span>
            </div>
            <pre className="text-[11px] text-muted overflow-x-auto whitespace-pre-wrap">
              {typeof event.detail === "string" ? event.detail : JSON.stringify(JSON.parse(event.detail || "{}"), null, 2)}
            </pre>
            {event.creator_id && (
              <p className="text-[10px] text-muted mt-1">Creator: {event.creator_id}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
