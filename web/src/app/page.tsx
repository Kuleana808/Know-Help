"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await apiFetch("/waitlist", {
        method: "POST",
        body: { email, source: "landing" },
      });
      setStatus("success");
      setMessage(res.message);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between max-w-5xl mx-auto px-6 py-6">
        <div className="font-serif text-xl font-medium">know.help</div>
        <div className="flex gap-4 text-sm">
          <a href="/login" className="text-muted hover:text-text transition-colors">
            Sign in
          </a>
          <a href="/login" className="btn-primary">
            Get started
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-3xl mx-auto px-6 pt-20 pb-32 text-center">
        <h1 className="font-serif text-5xl leading-tight mb-6">
          Your AI finally knows
          <br />
          <em>who you are</em>
        </h1>
        <p className="text-lg text-muted max-w-xl mx-auto mb-12 leading-relaxed">
          A persistent knowledge base that gives Claude memory about you, your
          ventures, your network, and your decisions. Powered by MCP.
        </p>

        {/* Waitlist form */}
        {status === "success" ? (
          <div className="card max-w-md mx-auto">
            <p className="text-accent font-medium">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="input flex-1"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="btn-primary whitespace-nowrap"
            >
              {status === "loading" ? "Joining..." : "Join waitlist"}
            </button>
          </form>
        )}
        {status === "error" && (
          <p className="text-red-600 text-sm mt-2">{message}</p>
        )}

        {/* Features grid */}
        <div className="grid md:grid-cols-3 gap-6 mt-24 text-left">
          <div className="card">
            <h3 className="font-serif text-lg mb-2">Trigger-based context</h3>
            <p className="text-sm text-muted">
              Files load automatically when Claude needs them. Say &ldquo;draft a
              pitch&rdquo; and your venture context appears.
            </p>
          </div>
          <div className="card">
            <h3 className="font-serif text-lg mb-2">Living intelligence</h3>
            <p className="text-sm text-muted">
              Crawls Twitter, Reddit, LinkedIn, TikTok, and RSS. Claude extracts
              signals relevant to your ventures.
            </p>
          </div>
          <div className="card">
            <h3 className="font-serif text-lg mb-2">Knowledge marketplace</h3>
            <p className="text-sm text-muted">
              Install community knowledge packs — sales playbooks, voice guides,
              planning frameworks. Create and sell your own.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-24 text-left">
          <h2 className="font-serif text-3xl text-center mb-12">How it works</h2>
          <div className="space-y-8 max-w-xl mx-auto">
            <div className="flex gap-4">
              <span className="text-accent font-mono text-sm bg-accent-light w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h4 className="font-medium mb-1">Connect to Claude Desktop</h4>
                <p className="text-sm text-muted">
                  Add know.help as an MCP server. One line in your config.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <span className="text-accent font-mono text-sm bg-accent-light w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <h4 className="font-medium mb-1">Build your knowledge base</h4>
                <p className="text-sm text-muted">
                  Add your identity, ventures, contacts, and decisions. Install
                  knowledge packs.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <span className="text-accent font-mono text-sm bg-accent-light w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <h4 className="font-medium mb-1">Claude remembers everything</h4>
                <p className="text-sm text-muted">
                  Context loads automatically based on triggers. Your AI knows who
                  you are, what you&apos;re building, and who matters.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="mt-24">
          <h2 className="font-serif text-3xl text-center mb-12">Pricing</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card text-left">
              <h3 className="font-serif text-xl mb-1">Self-hosted</h3>
              <p className="text-3xl font-mono mb-4">
                Free
                <span className="text-sm text-muted ml-1">forever</span>
              </p>
              <ul className="space-y-2 text-sm text-muted">
                <li>7 MCP tools</li>
                <li>Local knowledge base</li>
                <li>Community packs</li>
                <li>Self-managed crawlers</li>
              </ul>
            </div>
            <div className="card text-left border-accent border-2">
              <h3 className="font-serif text-xl mb-1">Pro</h3>
              <p className="text-3xl font-mono mb-4">
                $29
                <span className="text-sm text-muted ml-1">/month</span>
              </p>
              <ul className="space-y-2 text-sm text-muted">
                <li>Everything in Free</li>
                <li>Hosted knowledge base</li>
                <li>Managed crawlers</li>
                <li>Web dashboard</li>
                <li>14-day free trial</li>
              </ul>
              <a href="/login" className="btn-primary block text-center mt-6">
                Start free trial
              </a>
            </div>
            <div className="card text-left">
              <h3 className="font-serif text-xl mb-1">Team</h3>
              <p className="text-3xl font-mono mb-4">
                $79
                <span className="text-sm text-muted ml-1">/month</span>
              </p>
              <ul className="space-y-2 text-sm text-muted">
                <li>Everything in Pro</li>
                <li>Shared knowledge bases</li>
                <li>Team roles (RBAC)</li>
                <li>10 seats included</li>
                <li>Activity feed</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        <p>&copy; {new Date().getFullYear()} know.help</p>
      </footer>
    </div>
  );
}
