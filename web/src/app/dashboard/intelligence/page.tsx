"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";

interface IntelStatus {
  status: string;
  last_crawl?: string;
  sources_enabled: string[];
}

interface Signal {
  venture: string;
  summary: string;
  source_url: string;
  confidence: number;
  date: string;
}

export default function IntelligencePage() {
  const { data: status, refetch: refetchStatus } = useApi<IntelStatus>(
    "/api/intelligence/status"
  );
  const { data: signals, refetch: refetchSignals } = useApi<{ signals: Signal[] }>(
    "/api/intelligence/signals"
  );
  const [crawling, setCrawling] = useState(false);
  const [crawlLog, setCrawlLog] = useState<string[]>([]);

  async function runCrawl() {
    setCrawling(true);
    setCrawlLog([]);

    try {
      // Use SSE endpoint for live progress
      const token = localStorage.getItem("kh_token");
      const res = await fetch("/api/intelligence/crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error("Crawl failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            const data = line.slice(6);
            setCrawlLog((prev) => [...prev, data]);
          }
        }
      }

      refetchStatus();
      refetchSignals();
    } catch (err: any) {
      setCrawlLog((prev) => [...prev, `Error: ${err.message}`]);
    } finally {
      setCrawling(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Intelligence</h1>
        <button
          onClick={runCrawl}
          disabled={crawling}
          className="btn-primary"
        >
          {crawling ? "Crawling..." : "Run crawl now"}
        </button>
      </div>

      {/* Status */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h2 className="font-serif text-lg mb-3">Status</h2>
          <p className="text-sm">
            <span className="text-muted">Status:</span>{" "}
            <span className="capitalize">{status?.status || "unknown"}</span>
          </p>
          {status?.last_crawl && (
            <p className="text-sm mt-1">
              <span className="text-muted">Last crawl:</span>{" "}
              {new Date(status.last_crawl).toLocaleString()}
            </p>
          )}
          {status?.sources_enabled && status.sources_enabled.length > 0 && (
            <div className="flex gap-1 mt-3">
              {status.sources_enabled.map((s) => (
                <span
                  key={s}
                  className="text-xs bg-accent-light text-accent px-2 py-0.5 rounded"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="font-serif text-lg mb-3">Configuration</h2>
          <p className="text-sm text-muted mb-3">
            Configure which sources to crawl and their thresholds.
          </p>
          <a href="/dashboard/settings" className="btn-secondary text-xs">
            Edit config
          </a>
        </div>
      </div>

      {/* Crawl log */}
      {crawlLog.length > 0 && (
        <div className="card mb-8">
          <h2 className="font-serif text-lg mb-3">Crawl log</h2>
          <div className="bg-bg rounded p-3 font-mono text-xs max-h-48 overflow-y-auto space-y-1">
            {crawlLog.map((line, i) => (
              <p key={i} className="text-muted">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Signals feed */}
      <div className="card">
        <h2 className="font-serif text-lg mb-4">Recent signals</h2>
        {!signals?.signals?.length ? (
          <p className="text-sm text-muted">
            No signals yet. Run a crawl or enable intelligence sources.
          </p>
        ) : (
          <div className="space-y-4">
            {signals.signals.map((signal, i) => (
              <div key={i} className="border-l-2 border-accent pl-4 py-1">
                <p className="text-sm">{signal.summary}</p>
                <div className="flex gap-3 mt-1 text-xs text-muted">
                  <span>{signal.venture}</span>
                  <span>confidence: {signal.confidence}</span>
                  {signal.source_url && (
                    <a
                      href={signal.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      source
                    </a>
                  )}
                  <span>{new Date(signal.date).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
