"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function VerificationPage() {
  const [status, setStatus] = useState<string>("none");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    credentials: "",
    portfolio_url: "",
    linkedin_url: "",
    statement: "",
  });

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const data = await apiFetch<{ verification_status: string }>("/api/mindsets/creators/me");
      setStatus(data.verification_status || "none");
    } catch {
      // Not a creator yet
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/api/mindsets/creators/apply", {
        method: "POST",
        body: form,
      });
      setStatus("pending");
    } catch (err: any) {
      alert(err.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  if (status === "verified") {
    return (
      <div className="p-12 max-w-lg">
        <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
          Verification
        </p>
        <h1 className="font-serif text-3xl mb-4">Verified</h1>
        <div className="card border-l-4 border-l-accent">
          <p className="text-sm mb-2">Your creator account is verified.</p>
          <p className="text-xs text-muted">
            You can publish paid Mindsets and appear in the marketplace.
            Your profile shows a verification badge.
          </p>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="p-12 max-w-lg">
        <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
          Verification
        </p>
        <h1 className="font-serif text-3xl mb-4">Review in progress</h1>
        <div className="card">
          <p className="text-sm mb-2">Your verification is being reviewed.</p>
          <p className="text-xs text-muted">
            This usually takes 24-48 hours. You&apos;ll receive an email when it&apos;s complete.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-12 max-w-2xl">
      <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
        Verification
      </p>
      <h1 className="font-serif text-3xl mb-3">Get verified</h1>
      <p className="text-muted text-sm leading-relaxed mb-10">
        Verification confirms your professional credentials and unlocks paid Mindset publishing.
        Verified creators appear with a badge in the marketplace.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="label">Professional credentials</label>
          <textarea
            required
            value={form.credentials}
            onChange={(e) => setForm({ ...form, credentials: e.target.value })}
            className="input min-h-[100px]"
            placeholder="Years of experience, education, certifications, notable employers/clients..."
          />
        </div>
        <div>
          <label className="label">Portfolio / work samples URL</label>
          <input
            required
            value={form.portfolio_url}
            onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })}
            className="input"
            placeholder="https://yourportfolio.com"
          />
        </div>
        <div>
          <label className="label">LinkedIn profile URL</label>
          <input
            value={form.linkedin_url}
            onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
            className="input"
            placeholder="https://linkedin.com/in/yourname"
          />
        </div>
        <div>
          <label className="label">Why is your judgment worth subscribing to?</label>
          <textarea
            required
            value={form.statement}
            onChange={(e) => setForm({ ...form, statement: e.target.value })}
            className="input min-h-[120px]"
            placeholder="What specific expertise do you bring that AI alone cannot provide? What decisions have you made thousands of times that others face for the first time?"
          />
        </div>

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Submitting..." : "Submit for verification"}
        </button>
      </form>
    </div>
  );
}
