"use client";

import { useState, useEffect } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";

interface IntelConfig {
  crawl_schedule: string;
  confidence_threshold: number;
  sources: {
    twitter: { enabled: boolean; min_engagement: number };
    reddit: { enabled: boolean; min_upvotes: number };
    linkedin: { enabled: boolean; min_engagement: number };
    tiktok: { enabled: boolean; min_views: number };
    rss: { enabled: boolean; feeds: string[]; auto_discover: boolean };
  };
}

export default function SettingsPage() {
  const { data: config, loading } = useApi<IntelConfig>(
    "/api/intelligence/config"
  );
  const [form, setForm] = useState<IntelConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch("/api/intelligence/config", {
        method: "POST",
        body: form,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleSource(source: keyof IntelConfig["sources"]) {
    if (!form) return;
    setForm({
      ...form,
      sources: {
        ...form.sources,
        [source]: {
          ...form.sources[source],
          enabled: !form.sources[source].enabled,
        },
      },
    });
  }

  if (loading || !form) {
    return <p className="text-sm text-muted">Loading settings...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Settings</h1>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-accent">Saved</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {/* Intelligence config */}
      <div className="card mb-6">
        <h2 className="font-serif text-lg mb-4">Intelligence sources</h2>

        <div className="space-y-4">
          {/* Twitter */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <p className="text-sm font-medium">Twitter / X</p>
              <p className="text-xs text-muted">
                Min engagement: {form.sources.twitter.min_engagement}
              </p>
            </div>
            <button
              onClick={() => toggleSource("twitter")}
              className={`w-10 h-5 rounded-full transition-colors ${
                form.sources.twitter.enabled ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  form.sources.twitter.enabled
                    ? "translate-x-5"
                    : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Reddit */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <p className="text-sm font-medium">Reddit</p>
              <p className="text-xs text-muted">
                Min upvotes: {form.sources.reddit.min_upvotes}
              </p>
            </div>
            <button
              onClick={() => toggleSource("reddit")}
              className={`w-10 h-5 rounded-full transition-colors ${
                form.sources.reddit.enabled ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  form.sources.reddit.enabled
                    ? "translate-x-5"
                    : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* LinkedIn */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <p className="text-sm font-medium">LinkedIn</p>
              <p className="text-xs text-muted">
                Min engagement: {form.sources.linkedin.min_engagement}
              </p>
            </div>
            <button
              onClick={() => toggleSource("linkedin")}
              className={`w-10 h-5 rounded-full transition-colors ${
                form.sources.linkedin.enabled ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  form.sources.linkedin.enabled
                    ? "translate-x-5"
                    : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* TikTok */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <p className="text-sm font-medium">TikTok</p>
              <p className="text-xs text-muted">
                Min views: {form.sources.tiktok.min_views}
              </p>
            </div>
            <button
              onClick={() => toggleSource("tiktok")}
              className={`w-10 h-5 rounded-full transition-colors ${
                form.sources.tiktok.enabled ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  form.sources.tiktok.enabled
                    ? "translate-x-5"
                    : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* RSS */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">RSS feeds</p>
              <p className="text-xs text-muted">
                {form.sources.rss.feeds?.length || 0} feeds configured
              </p>
            </div>
            <button
              onClick={() => toggleSource("rss")}
              className={`w-10 h-5 rounded-full transition-colors ${
                form.sources.rss.enabled ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  form.sources.rss.enabled
                    ? "translate-x-5"
                    : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="card mb-6">
        <h2 className="font-serif text-lg mb-4">Crawl schedule</h2>
        <select
          value={form.crawl_schedule}
          onChange={(e) =>
            setForm({ ...form, crawl_schedule: e.target.value })
          }
          className="input max-w-xs"
        >
          <option value="every_hour">Every hour</option>
          <option value="every_6_hours">Every 6 hours</option>
          <option value="every_12_hours">Every 12 hours</option>
        </select>
      </div>

      {/* Confidence threshold */}
      <div className="card mb-6">
        <h2 className="font-serif text-lg mb-4">Confidence threshold</h2>
        <p className="text-sm text-muted mb-3">
          Signals below this confidence score will be skipped.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={form.confidence_threshold}
            onChange={(e) =>
              setForm({
                ...form,
                confidence_threshold: parseFloat(e.target.value),
              })
            }
            className="flex-1"
          />
          <span className="font-mono text-sm w-12 text-right">
            {form.confidence_threshold.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Billing */}
      <div className="card">
        <h2 className="font-serif text-lg mb-4">Billing</h2>
        <p className="text-sm text-muted mb-3">
          Manage your subscription and payment method.
        </p>
        <button
          onClick={async () => {
            try {
              const res = await apiFetch("/api/billing/portal");
              window.location.href = res.portal_url;
            } catch {
              alert("Could not open billing portal");
            }
          }}
          className="btn-secondary"
        >
          Open billing portal
        </button>
      </div>
    </div>
  );
}
