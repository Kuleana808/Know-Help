"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function NewMindsetPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    domain: "",
    description: "",
    triggers: "",
    price_cents: 2900,
  });

  function update(field: string, value: string | number) {
    setForm({ ...form, [field]: value });
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const triggers = form.triggers
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await apiFetch<{ mindset: { id: string } }>("/api/mindsets/publish", {
        method: "POST",
        body: {
          name: form.name,
          domain: form.domain,
          description: form.description,
          triggers,
          price_cents: form.price_cents,
          files: {},
        },
      });

      router.push(`/creator/mindsets/${res.mindset.id}`);
    } catch (err: any) {
      alert(err.message || "Failed to create mindset");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-12 max-w-2xl">
      <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
        New Mindset
      </p>
      <h1 className="font-serif text-3xl mb-8">Create a Mindset</h1>

      {/* Progress */}
      <div className="flex gap-1 mb-10">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-0.5 flex-1 ${s <= step ? "bg-accent" : "bg-border"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <h2 className="font-serif text-xl mb-2">Basic Information</h2>
          <div>
            <label className="label">Mindset name</label>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className="input"
              placeholder="Brand Design Judgment"
            />
            <p className="text-[11px] text-border-dark mt-1.5">
              Choose something specific. &ldquo;Brand Design Judgment&rdquo; is better than &ldquo;Design Tips&rdquo;.
            </p>
          </div>
          <div>
            <label className="label">Domain</label>
            <input
              value={form.domain}
              onChange={(e) => update("domain", e.target.value)}
              className="input"
              placeholder="Brand Design"
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="input min-h-[120px]"
              placeholder="What judgment does this Mindset contain? What does it enable the subscriber to do that generic AI cannot?"
            />
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!form.name || !form.domain || !form.description}
            className="btn-primary"
          >
            Next: Triggers & Pricing
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <h2 className="font-serif text-xl mb-2">Triggers & Pricing</h2>
          <div>
            <label className="label">Trigger keywords (comma separated)</label>
            <input
              value={form.triggers}
              onChange={(e) => update("triggers", e.target.value)}
              className="input"
              placeholder="brand, logo, typography, color palette, identity, visual, font"
            />
            <p className="text-[11px] text-border-dark mt-1.5">
              These keywords activate the Mindset in subscribers&apos; AI conversations.
            </p>
          </div>
          <div>
            <label className="label">Monthly price (USD)</label>
            <div className="flex items-center gap-4">
              {[0, 1900, 2900, 3900, 4900].map((cents) => (
                <button
                  key={cents}
                  onClick={() => update("price_cents", cents)}
                  className={`px-4 py-2 border text-sm ${
                    form.price_cents === cents
                      ? "border-accent text-accent bg-accent-light"
                      : "border-border text-muted hover:border-border-dark"
                  }`}
                >
                  {cents === 0 ? "Free" : `$${cents / 100}`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-border-dark mt-1.5">
              You earn 70% of every subscription. know.help takes 30%.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-secondary">
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!form.triggers}
              className="btn-primary"
            >
              Next: Review
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <h2 className="font-serif text-xl mb-2">Review & Create</h2>

          <div className="card space-y-4">
            <div>
              <p className="label">Name</p>
              <p className="text-sm">{form.name}</p>
            </div>
            <div>
              <p className="label">Domain</p>
              <p className="text-sm">{form.domain}</p>
            </div>
            <div>
              <p className="label">Description</p>
              <p className="text-sm text-muted">{form.description}</p>
            </div>
            <div>
              <p className="label">Triggers</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {form.triggers.split(",").map((t) => (
                  <span
                    key={t.trim()}
                    className="text-[10px] px-2 py-0.5 border border-border text-muted"
                  >
                    {t.trim()}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Price</p>
              <p className="text-sm">
                {form.price_cents === 0 ? "Free" : `$${form.price_cents / 100}/month`}
                {form.price_cents > 0 && (
                  <span className="text-muted ml-2">
                    (you earn ${((form.price_cents * 0.7) / 100).toFixed(0)}/subscriber)
                  </span>
                )}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted">
            After creating, you&apos;ll be taken to the Mindset editor to add your judgment files.
            You need at least 5 files to publish.
          </p>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-secondary">
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Creating..." : "Create Mindset"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
