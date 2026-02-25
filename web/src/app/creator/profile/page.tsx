"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

interface Profile {
  display_name: string;
  headline: string;
  domain: string;
  bio: string;
  credentials: string;
  work_samples: string;
  profile_image_url: string;
  slug: string;
  verification_status: string;
}

export default function CreatorProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    display_name: "",
    headline: "",
    domain: "",
    bio: "",
    credentials: "",
    work_samples: "",
    profile_image_url: "",
    slug: "",
    verification_status: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const data = await apiFetch<Profile>("/api/mindsets/creators/me");
      setProfile(data);
    } catch {
      // New creator
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch("/api/mindsets/creators/profile", {
        method: "PUT",
        body: profile,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function update(field: string, value: string) {
    setProfile({ ...profile, [field]: value });
  }

  if (loading) {
    return (
      <div className="p-12">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-12 max-w-2xl">
      <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
        Creator Profile
      </p>
      <h1 className="font-serif text-3xl mb-8">Profile Settings</h1>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Display name</label>
            <input
              value={profile.display_name}
              onChange={(e) => update("display_name", e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Handle (URL slug)</label>
            <input
              value={profile.slug}
              onChange={(e) => update("slug", e.target.value)}
              className="input"
              placeholder="maya-reyes"
            />
            <p className="text-[10px] text-border-dark mt-1">
              know.help/creators/{profile.slug || "your-handle"}
            </p>
          </div>
        </div>

        <div>
          <label className="label">Headline</label>
          <input
            value={profile.headline}
            onChange={(e) => update("headline", e.target.value)}
            className="input"
            placeholder="Brand Director, 15 years"
          />
        </div>

        <div>
          <label className="label">Domain of expertise</label>
          <input
            value={profile.domain}
            onChange={(e) => update("domain", e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label">Bio</label>
          <textarea
            value={profile.bio}
            onChange={(e) => update("bio", e.target.value)}
            className="input min-h-[120px]"
            placeholder="Your professional background and what makes your perspective unique."
          />
        </div>

        <div>
          <label className="label">Credentials</label>
          <textarea
            value={profile.credentials}
            onChange={(e) => update("credentials", e.target.value)}
            className="input min-h-[80px]"
            placeholder="Years of experience, notable clients, published work..."
          />
        </div>

        <div>
          <label className="label">Work samples (URLs, one per line)</label>
          <textarea
            value={profile.work_samples}
            onChange={(e) => update("work_samples", e.target.value)}
            className="input min-h-[80px]"
            placeholder="https://portfolio.com/case-study&#10;https://medium.com/@you/article"
          />
        </div>

        <div>
          <label className="label">Profile image URL</label>
          <input
            value={profile.profile_image_url}
            onChange={(e) => update("profile_image_url", e.target.value)}
            className="input"
            placeholder="https://..."
          />
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save profile"}
          </button>
          {saved && <span className="text-accent text-sm">Saved.</span>}
        </div>
      </form>

      {/* Stripe Connect */}
      <div className="card mt-10">
        <h3 className="font-serif text-lg mb-2">Payment Setup</h3>
        <p className="text-xs text-muted mb-4">
          Connect your Stripe account to receive payouts. You earn 70% of every subscription.
        </p>
        <button className="btn-secondary text-xs">
          Connect Stripe Account
        </button>
      </div>
    </div>
  );
}
