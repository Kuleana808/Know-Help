"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

interface CaptureSignal {
  id: string;
  signal_type: string;
  content: string;
  context: string;
  platform: string;
  confidence: number;
  status: string;
  created_at: string;
}

export default function CapturePage() {
  const [signals, setSignals] = useState<CaptureSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    loadSignals();
  }, []);

  async function loadSignals() {
    try {
      const data = await apiFetch<{ signals: CaptureSignal[] }>("/api/capture/signals?limit=100");
      setSignals(data.signals || []);
    } catch {
      // Not connected
    } finally {
      setLoading(false);
    }
  }

  async function updateSignal(id: string, status: string) {
    await apiFetch(`/api/capture/signals/${id}`, {
      method: "PATCH",
      body: { status },
    });
    await loadSignals();
  }

  const filtered = filter === "all"
    ? signals
    : signals.filter((s) => s.signal_type === filter);

  const signalTypes = [...new Set(signals.map((s) => s.signal_type))];
  const pendingCount = signals.filter((s) => s.status === "pending").length;
  const approvedCount = signals.filter((s) => s.status === "approved").length;

  if (loading) {
    return <div className="p-12"><p className="text-muted text-sm">Loading...</p></div>;
  }

  return (
    <div className="p-12 max-w-3xl">
      <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
        Captured Signals
      </p>
      <h1 className="font-serif text-3xl mb-3">Ambient Capture</h1>
      <p className="text-sm text-muted leading-[1.85] mb-8">
        Signals captured from your AI conversations by the browser extension.
        Review and approve to include in your Mindset.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4 text-center">
          <div className="text-2xl font-serif">{signals.length}</div>
          <div className="text-[10px] text-muted">Total captured</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-serif">{pendingCount}</div>
          <div className="text-[10px] text-muted">Pending review</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-serif">{approvedCount}</div>
          <div className="text-[10px] text-muted">Approved</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`text-[10px] px-3 py-1 border ${filter === "all" ? "border-accent text-accent" : "border-border text-muted"}`}
        >
          All
        </button>
        {signalTypes.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`text-[10px] px-3 py-1 border ${filter === type ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Signal list */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-muted text-sm">No captured signals yet.</p>
          <p className="text-[11px] text-border-dark mt-2">
            Install the browser extension to start capturing methodology from your AI conversations.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((signal) => (
            <div key={signal.id} className="card p-5">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] px-1.5 py-0.5 border border-border text-muted">
                    {signal.signal_type}
                  </span>
                  <span className="text-[9px] text-muted">
                    {signal.platform} · {(signal.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <span className={`text-[9px] ${
                  signal.status === "approved" ? "text-accent" :
                  signal.status === "rejected" ? "text-red-500" : "text-muted"
                }`}>
                  {signal.status}
                </span>
              </div>

              <p className="text-xs leading-[1.7] mb-3">{signal.content}</p>

              {signal.context && (
                <p className="text-[11px] text-muted bg-bg2 p-3 border border-border leading-[1.6] mb-3">
                  Context: {signal.context.slice(0, 200)}...
                </p>
              )}

              {signal.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => updateSignal(signal.id, "approved")}
                    className="text-[10px] px-3 py-1 border border-accent text-accent hover:bg-accent-light"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => updateSignal(signal.id, "rejected")}
                    className="text-[10px] px-3 py-1 border border-border text-muted hover:text-red-500"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
