"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface CreatorMindset {
  id: string;
  slug: string;
  name: string;
  domain: string;
  status: string;
  version: string;
  subscriber_count: number;
  file_count: number;
  last_updated_at: string;
  revenue_cents: number;
}

export default function CreatorMindsetsPage() {
  const [mindsets, setMindsets] = useState<CreatorMindset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMindsets();
  }, []);

  async function loadMindsets() {
    try {
      const data = await apiFetch<{ mindsets: CreatorMindset[] }>("/api/mindsets/mine");
      setMindsets(data.mindsets || []);
    } catch {
      // Empty state
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-12">
      <div className="flex justify-between items-center mb-8">
        <div>
          <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-3">
            My Mindsets
          </p>
          <h1 className="font-serif text-3xl">Published Mindsets</h1>
        </div>
        <Link href="/creator/mindsets/new" className="btn-primary">
          Create new Mindset
        </Link>
      </div>

      {loading ? (
        <p className="text-muted text-sm py-12 text-center">Loading...</p>
      ) : mindsets.length === 0 ? (
        <div className="card text-center py-16">
          <p className="font-serif text-xl mb-3">No Mindsets yet.</p>
          <p className="text-muted text-sm mb-6">
            Create your first Mindset to start publishing your expertise.
          </p>
          <Link href="/creator/mindsets/new" className="btn-primary inline-block">
            Create Mindset
          </Link>
        </div>
      ) : (
        <div className="space-y-px border border-border">
          {mindsets.map((m) => (
            <Link
              key={m.id}
              href={`/creator/mindsets/${m.id}`}
              className="flex items-center justify-between p-5 bg-bg hover:bg-bg2 transition-colors"
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-serif text-base">{m.name}</span>
                  <span className={`text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 border ${
                    m.status === "published"
                      ? "text-accent border-accent bg-accent-light"
                      : m.status === "draft"
                      ? "text-muted border-border"
                      : "text-border-dark border-border"
                  }`}>
                    {m.status}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {m.domain} &middot; v{m.version} &middot; {m.file_count} files
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm">{m.subscriber_count} subscribers</p>
                <p className="text-xs text-muted">
                  ${(m.revenue_cents / 100).toFixed(0)} revenue
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
