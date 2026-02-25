"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Step = 1 | 2 | 3 | 4 | 5;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Identity
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // Step 2: Ventures
  const [ventures, setVentures] = useState([{ name: "", description: "" }]);

  // Step 3: Contacts
  const [contacts, setContacts] = useState([
    { name: "", role: "", context: "" },
  ]);

  // Step 4: Intelligence sources
  const [sources, setSources] = useState({
    twitter: false,
    reddit: false,
    linkedin: false,
    tiktok: false,
    rss: false,
  });

  // Step 5: MCP config
  const [mcpConfig, setMcpConfig] = useState<any>(null);

  async function handleNext() {
    setLoading(true);
    setError("");
    try {
      switch (step) {
        case 1:
          await apiFetch("/api/onboarding/identity", {
            method: "POST",
            body: { name, role, location, timezone },
          });
          break;
        case 2:
          await apiFetch("/api/onboarding/ventures", {
            method: "POST",
            body: { ventures: ventures.filter((v) => v.name.trim()) },
          });
          break;
        case 3:
          await apiFetch("/api/onboarding/contacts", {
            method: "POST",
            body: { contacts: contacts.filter((c) => c.name.trim()) },
          });
          break;
        case 4:
          await apiFetch("/api/onboarding/intelligence", {
            method: "POST",
            body: { sources },
          });
          break;
        case 5:
          router.push("/dashboard");
          return;
      }

      if (step === 4) {
        // Load MCP config for step 5
        const config = await apiFetch("/api/onboarding/mcp-config");
        setMcpConfig(config);
      }

      setStep((step + 1) as Step);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const stepLabels = ["Identity", "Ventures", "Contacts", "Intelligence", "Connect"];

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="card max-w-lg w-full">
        {/* Progress bar */}
        <div className="flex gap-1 mb-8">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex-1">
              <div
                className={`h-1 rounded-full transition-colors ${
                  i + 1 <= step ? "bg-accent" : "bg-border"
                }`}
              />
              <p
                className={`text-xs mt-1 ${
                  i + 1 === step ? "text-accent" : "text-muted"
                }`}
              >
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Step 1: Identity */}
        {step === 1 && (
          <div>
            <h2 className="font-serif text-2xl mb-2">Who are you?</h2>
            <p className="text-sm text-muted mb-6">
              Tell Claude about yourself so it can provide personalized context.
            </p>
            <div className="space-y-4">
              <div>
                <label className="label">Full name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="Jane Smith"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Role</label>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="input"
                  placeholder="Founder & CEO"
                />
              </div>
              <div>
                <label className="label">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="input"
                  placeholder="San Francisco, CA"
                />
              </div>
              <div>
                <label className="label">Timezone</label>
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Ventures */}
        {step === 2 && (
          <div>
            <h2 className="font-serif text-2xl mb-2">Your ventures</h2>
            <p className="text-sm text-muted mb-6">
              What are you building? Add up to 3 ventures.
            </p>
            <div className="space-y-4">
              {ventures.map((v, i) => (
                <div key={i} className="p-3 bg-bg rounded space-y-2">
                  <input
                    value={v.name}
                    onChange={(e) => {
                      const next = [...ventures];
                      next[i].name = e.target.value;
                      setVentures(next);
                    }}
                    className="input"
                    placeholder="Venture name"
                  />
                  <textarea
                    value={v.description}
                    onChange={(e) => {
                      const next = [...ventures];
                      next[i].description = e.target.value;
                      setVentures(next);
                    }}
                    className="input resize-none h-16"
                    placeholder="Brief description"
                  />
                </div>
              ))}
              {ventures.length < 3 && (
                <button
                  onClick={() =>
                    setVentures([...ventures, { name: "", description: "" }])
                  }
                  className="text-sm text-accent hover:underline"
                >
                  + Add another venture
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Contacts */}
        {step === 3 && (
          <div>
            <h2 className="font-serif text-2xl mb-2">Key contacts</h2>
            <p className="text-sm text-muted mb-6">
              Add people Claude should know about. You can add more later.
            </p>
            <div className="space-y-4">
              {contacts.map((c, i) => (
                <div key={i} className="p-3 bg-bg rounded space-y-2">
                  <input
                    value={c.name}
                    onChange={(e) => {
                      const next = [...contacts];
                      next[i].name = e.target.value;
                      setContacts(next);
                    }}
                    className="input"
                    placeholder="Name"
                  />
                  <div className="flex gap-2">
                    <input
                      value={c.role}
                      onChange={(e) => {
                        const next = [...contacts];
                        next[i].role = e.target.value;
                        setContacts(next);
                      }}
                      className="input flex-1"
                      placeholder="Role"
                    />
                    <input
                      value={c.context}
                      onChange={(e) => {
                        const next = [...contacts];
                        next[i].context = e.target.value;
                        setContacts(next);
                      }}
                      className="input flex-1"
                      placeholder="Context"
                    />
                  </div>
                </div>
              ))}
              {contacts.length < 5 && (
                <button
                  onClick={() =>
                    setContacts([
                      ...contacts,
                      { name: "", role: "", context: "" },
                    ])
                  }
                  className="text-sm text-accent hover:underline"
                >
                  + Add another contact
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Intelligence */}
        {step === 4 && (
          <div>
            <h2 className="font-serif text-2xl mb-2">Intelligence sources</h2>
            <p className="text-sm text-muted mb-6">
              Which sources should Claude monitor for signals relevant to your
              ventures?
            </p>
            <div className="space-y-3">
              {(
                [
                  ["twitter", "Twitter / X"],
                  ["reddit", "Reddit"],
                  ["linkedin", "LinkedIn"],
                  ["tiktok", "TikTok"],
                  ["rss", "RSS feeds"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-3 p-3 bg-bg rounded cursor-pointer hover:bg-bg2 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={sources[key]}
                    onChange={() =>
                      setSources({ ...sources, [key]: !sources[key] })
                    }
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: MCP Connection */}
        {step === 5 && (
          <div>
            <h2 className="font-serif text-2xl mb-2">Connect Claude Desktop</h2>
            <p className="text-sm text-muted mb-6">
              Add this to your Claude Desktop configuration file to connect your
              knowledge base.
            </p>
            {mcpConfig && (
              <div className="bg-bg rounded p-4">
                <p className="text-xs text-muted mb-2">
                  ~/.config/claude/claude_desktop_config.json
                </p>
                <pre className="text-xs font-mono overflow-x-auto">
                  {JSON.stringify(mcpConfig.claude_desktop_config, null, 2)}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      JSON.stringify(mcpConfig.claude_desktop_config, null, 2)
                    );
                  }}
                  className="btn-secondary text-xs mt-3"
                >
                  Copy to clipboard
                </button>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="btn-secondary"
            >
              Back
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleNext}
            disabled={loading}
            className="btn-primary"
          >
            {loading
              ? "Saving..."
              : step === 5
              ? "Go to dashboard"
              : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
