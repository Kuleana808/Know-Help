"use client";

import { useApi } from "@/lib/hooks";

interface HealthData {
  status: string;
  timestamp: string;
  ws_connections: number;
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  } | null;
}

interface FileTree {
  files: { path: string; type: string; size?: number; modified?: string }[];
}

export default function DashboardOverview() {
  const { data: health } = useApi<HealthData>("/health");
  const { data: files } = useApi<FileTree>("/api/files/tree");
  const { data: intel } = useApi<{ sources: Record<string, any>; last_crawl?: any }>(
    "/api/intelligence/status"
  );

  const fileCount = files?.files?.length || 0;
  const enabledSources = intel?.sources
    ? Object.entries(intel.sources).filter(([, v]) => v.enabled).map(([k]) => k)
    : [];
  const intelStatus = enabledSources.length > 0 ? "Active" : "Inactive";
  const lastCrawlTime = intel?.last_crawl?.start_time;

  return (
    <div>
      <h1 className="font-serif text-3xl mb-8">Dashboard</h1>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* Status card */}
        <div className="card">
          <p className="text-sm text-muted mb-1">System status</p>
          <p className="text-2xl font-mono">
            {health?.status === "ok" ? (
              <span className="text-accent">Online</span>
            ) : (
              <span className="text-muted">Checking...</span>
            )}
          </p>
          {health?.ws_connections !== undefined && (
            <p className="text-xs text-muted mt-2">
              {health.ws_connections} WebSocket connection
              {health.ws_connections !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Files card */}
        <div className="card">
          <p className="text-sm text-muted mb-1">Knowledge files</p>
          <p className="text-2xl font-mono">{fileCount}</p>
          <a
            href="/dashboard/files"
            className="text-xs text-accent hover:underline mt-2 inline-block"
          >
            Manage files
          </a>
        </div>

        {/* Intelligence card */}
        <div className="card">
          <p className="text-sm text-muted mb-1">Intelligence</p>
          <p className="text-2xl font-mono capitalize">
            {intelStatus}
          </p>
          {lastCrawlTime && (
            <p className="text-xs text-muted mt-2">
              Last crawl: {new Date(lastCrawlTime).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Queue stats */}
      {health?.queue && (
        <div className="card mb-8">
          <h2 className="font-serif text-lg mb-4">Crawler queue</h2>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-mono">{health.queue.waiting}</p>
              <p className="text-xs text-muted">Waiting</p>
            </div>
            <div>
              <p className="text-2xl font-mono">{health.queue.active}</p>
              <p className="text-xs text-muted">Active</p>
            </div>
            <div>
              <p className="text-2xl font-mono">{health.queue.completed}</p>
              <p className="text-xs text-muted">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-mono">{health.queue.failed}</p>
              <p className="text-xs text-muted">Failed</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="card">
        <h2 className="font-serif text-lg mb-4">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/dashboard/files" className="btn-secondary">
            Browse files
          </a>
          <a href="/dashboard/network" className="btn-secondary">
            View contacts
          </a>
          <a href="/dashboard/intelligence" className="btn-secondary">
            Run crawl
          </a>
          <a href="/dashboard/settings" className="btn-secondary">
            Settings
          </a>
        </div>
      </div>
    </div>
  );
}
