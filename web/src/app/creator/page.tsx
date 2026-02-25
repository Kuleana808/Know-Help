"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, getToken } from "@/lib/api";

interface CreatorStats {
  mindset_count: number;
  total_subscribers: number;
  total_revenue_cents: number;
  pending_payout_cents: number;
  verification_status: string;
}

export default function CreatorDashboard() {
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [email, setEmail] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyForm, setApplyForm] = useState({
    display_name: "",
    headline: "",
    domain: "",
    bio: "",
    credentials: "",
    work_samples: "",
  });
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (token) {
      setIsAuth(true);
      loadStats();
    } else {
      setLoading(false);
    }
  }, []);

  async function loadStats() {
    try {
      const data = await apiFetch<CreatorStats>("/api/mindsets/creators/me");
      setStats(data);
    } catch {
      // Creator may not exist yet
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setApplying(true);
    try {
      await apiFetch("/api/mindsets/creators/apply", {
        method: "POST",
        body: { ...applyForm, email },
      });
      setApplied(true);
    } catch (err: any) {
      alert(err.message || "Application failed");
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  // Show application form if not authenticated
  if (!isAuth || !stats) {
    if (applied) {
      return (
        <div className="p-12 max-w-lg">
          <h1 className="font-serif text-3xl mb-6">Application submitted.</h1>
          <p className="text-muted text-sm leading-relaxed mb-4">
            We review applications within 48 hours. You&apos;ll receive an email when your
            creator account is approved.
          </p>
          <Link href="/mindsets" className="btn-primary inline-block">
            Browse Mindsets
          </Link>
        </div>
      );
    }

    return (
      <div className="p-12 max-w-2xl">
        <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
          Creator Application
        </p>
        <h1 className="font-serif text-3xl mb-3">Publish your Mindset.</h1>
        <p className="text-muted text-sm leading-relaxed mb-10">
          You have expertise worth subscribing to. Apply to become a verified creator
          and publish your professional judgment as a living Mindset. Earn 70% of every subscription.
        </p>

        <form onSubmit={handleApply} className="space-y-6">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@company.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Display name</label>
              <input
                required
                value={applyForm.display_name}
                onChange={(e) => setApplyForm({ ...applyForm, display_name: e.target.value })}
                className="input"
                placeholder="Maya Reyes"
              />
            </div>
            <div>
              <label className="label">Headline</label>
              <input
                required
                value={applyForm.headline}
                onChange={(e) => setApplyForm({ ...applyForm, headline: e.target.value })}
                className="input"
                placeholder="Brand Director, 15 years"
              />
            </div>
          </div>
          <div>
            <label className="label">Domain of expertise</label>
            <input
              required
              value={applyForm.domain}
              onChange={(e) => setApplyForm({ ...applyForm, domain: e.target.value })}
              className="input"
              placeholder="Brand Design, Growth Marketing, Sales..."
            />
          </div>
          <div>
            <label className="label">Bio</label>
            <textarea
              required
              value={applyForm.bio}
              onChange={(e) => setApplyForm({ ...applyForm, bio: e.target.value })}
              className="input min-h-[100px]"
              placeholder="What do you do? What makes your perspective unique?"
            />
          </div>
          <div>
            <label className="label">Credentials</label>
            <textarea
              required
              value={applyForm.credentials}
              onChange={(e) => setApplyForm({ ...applyForm, credentials: e.target.value })}
              className="input min-h-[80px]"
              placeholder="Years of experience, notable clients, published work, certifications..."
            />
          </div>
          <div>
            <label className="label">Work samples (URLs)</label>
            <textarea
              value={applyForm.work_samples}
              onChange={(e) => setApplyForm({ ...applyForm, work_samples: e.target.value })}
              className="input min-h-[80px]"
              placeholder="Links to portfolio, articles, case studies (one per line)"
            />
          </div>

          <button type="submit" disabled={applying} className="btn-primary">
            {applying ? "Submitting..." : "Submit application"}
          </button>
        </form>
      </div>
    );
  }

  // Authenticated creator dashboard
  return (
    <div className="p-12">
      <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
        Creator Dashboard
      </p>
      <h1 className="font-serif text-3xl mb-8">Overview</h1>

      <div className="grid grid-cols-4 gap-px bg-border border border-border mb-10">
        <StatCard label="Published Mindsets" value={stats.mindset_count.toString()} />
        <StatCard label="Total Subscribers" value={stats.total_subscribers.toString()} />
        <StatCard
          label="Total Revenue"
          value={`$${(stats.total_revenue_cents / 100).toFixed(0)}`}
        />
        <StatCard
          label="Pending Payout"
          value={`$${(stats.pending_payout_cents / 100).toFixed(0)}`}
          highlight
        />
      </div>

      <div className="flex gap-4">
        <Link href="/creator/mindsets/new" className="btn-primary">
          Create new Mindset
        </Link>
        <Link href="/creator/mindsets" className="btn-secondary">
          View my Mindsets
        </Link>
      </div>

      {stats.verification_status !== "verified" && (
        <div className="card mt-8 border-l-4 border-l-accent">
          <p className="text-sm font-medium mb-1">Verification {stats.verification_status === "pending" ? "pending" : "required"}</p>
          <p className="text-xs text-muted mb-3">
            {stats.verification_status === "pending"
              ? "Your verification is being reviewed. This usually takes 24-48 hours."
              : "Complete verification to publish paid Mindsets and appear in the marketplace."}
          </p>
          {stats.verification_status !== "pending" && (
            <Link href="/creator/verify" className="text-accent text-xs hover:underline">
              Submit verification
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-bg p-6">
      <p className="text-[10px] tracking-[0.14em] uppercase text-border-dark mb-2">{label}</p>
      <p className={`font-serif text-3xl font-normal ${highlight ? "text-accent" : "text-text"}`}>
        {value}
      </p>
    </div>
  );
}
