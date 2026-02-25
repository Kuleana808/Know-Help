"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";

interface Decision {
  date: string;
  venture: string;
  decision: string;
  reasoning: string;
  alternatives?: string[];
  outcome: string;
}

interface Failure {
  date: string;
  venture: string;
  what_failed: string;
  root_cause: string;
  prevention: string;
}

type TabId = "decisions" | "failures" | "activity";

export default function LogsPage() {
  const [tab, setTab] = useState<TabId>("decisions");
  const [activityDate, setActivityDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const { data: decisions } = useApi<{ decisions: Decision[] }>(
    tab === "decisions" ? "/api/log/decisions" : null
  );
  const { data: failures } = useApi<{ failures: Failure[] }>(
    tab === "failures" ? "/api/log/failures" : null
  );
  const { data: activity } = useApi<{ content: string }>(
    tab === "activity" ? `/api/log/activity?date=${activityDate}` : null
  );

  const tabs: { id: TabId; label: string }[] = [
    { id: "decisions", label: "Decisions" },
    { id: "failures", label: "Failures" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6">Logs</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Decisions tab */}
      {tab === "decisions" && (
        <div className="space-y-4">
          {!decisions?.decisions?.length ? (
            <p className="text-sm text-muted">No decisions logged yet.</p>
          ) : (
            decisions.decisions
              .slice()
              .reverse()
              .map((d, i) => (
                <div key={i} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-sm">{d.decision}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        d.outcome === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : d.outcome === "success"
                          ? "bg-green-100 text-green-700"
                          : "bg-bg2 text-muted"
                      }`}
                    >
                      {d.outcome}
                    </span>
                  </div>
                  <p className="text-sm text-muted mb-2">{d.reasoning}</p>
                  <div className="flex gap-3 text-xs text-muted">
                    <span>{d.venture}</span>
                    <span>{new Date(d.date).toLocaleDateString()}</span>
                  </div>
                  {d.alternatives && d.alternatives.length > 0 && (
                    <p className="text-xs text-muted mt-2">
                      Alternatives: {d.alternatives.join(", ")}
                    </p>
                  )}
                </div>
              ))
          )}
        </div>
      )}

      {/* Failures tab */}
      {tab === "failures" && (
        <div className="space-y-4">
          {!failures?.failures?.length ? (
            <p className="text-sm text-muted">No failures logged yet.</p>
          ) : (
            failures.failures
              .slice()
              .reverse()
              .map((f, i) => (
                <div key={i} className="card border-l-4 border-l-red-300">
                  <h3 className="font-medium text-sm mb-2">{f.what_failed}</h3>
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted">Root cause:</span>{" "}
                      {f.root_cause}
                    </p>
                    <p>
                      <span className="text-muted">Prevention:</span>{" "}
                      {f.prevention}
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs text-muted mt-3">
                    <span>{f.venture}</span>
                    <span>{new Date(f.date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {/* Activity tab */}
      {tab === "activity" && (
        <div>
          <input
            type="date"
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            className="input max-w-xs mb-4"
          />
          <div className="card">
            {activity?.content ? (
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                {activity.content}
              </pre>
            ) : (
              <p className="text-sm text-muted">No activity for this date.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
