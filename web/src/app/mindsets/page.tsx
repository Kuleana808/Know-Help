"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import MindsetCard from "@/components/mindset-card";
import { apiFetch } from "@/lib/api";

interface Mindset {
  id: string;
  slug: string;
  name: string;
  description: string;
  domain: string;
  creator_handle: string;
  creator_name: string;
  verified: boolean;
  price_cents: number;
  subscriber_count: number;
  trigger_count: number;
  file_count: number;
  last_updated_at: string;
  featured?: boolean;
}

const CATEGORIES = [
  "All",
  "Brand Design",
  "Growth Marketing",
  "Sales",
  "Operations",
  "Content",
  "Engineering",
  "Finance",
  "Legal",
  "Product",
];

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "subscribers", label: "Most Subscribers" },
  { value: "updated", label: "Recently Updated" },
];

export default function MindsetsPage() {
  const [mindsets, setMindsets] = useState<Mindset[]>([]);
  const [featured, setFeatured] = useState<Mindset[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("featured");

  useEffect(() => {
    loadMindsets();
    loadFeatured();
  }, []);

  async function loadMindsets() {
    try {
      const data = await apiFetch<{ mindsets: Mindset[] }>("/api/mindsets");
      setMindsets(data.mindsets || []);
    } catch {
      // Use sample data for development
      setMindsets(SAMPLE_MINDSETS);
    } finally {
      setLoading(false);
    }
  }

  async function loadFeatured() {
    try {
      const data = await apiFetch<{ featured: Mindset[] }>("/api/mindsets/featured");
      setFeatured(data.featured || []);
    } catch {
      setFeatured(SAMPLE_MINDSETS.slice(0, 3));
    }
  }

  const filtered = mindsets.filter(
    (m) => category === "All" || m.domain === category
  );

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "newest":
        return new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime();
      case "subscribers":
        return b.subscriber_count - a.subscriber_count;
      case "updated":
        return new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime();
      default:
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    }
  });

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-12 py-5 flex justify-between items-center bg-bg/90 backdrop-blur-md border-b border-border">
        <Link href="/" className="font-mono text-[13px] tracking-wider text-text">
          know<span className="text-accent-mid">.help</span>
        </Link>
        <div className="flex gap-7 items-center">
          <Link href="/#how" className="text-[11px] tracking-[0.1em] uppercase text-muted hover:text-text transition-colors">
            How it works
          </Link>
          <Link href="/mindsets" className="text-[11px] tracking-[0.1em] uppercase text-text">
            Mindsets
          </Link>
          <Link href="/#pricing" className="text-[11px] tracking-[0.1em] uppercase text-muted hover:text-text transition-colors">
            Pricing
          </Link>
          <Link href="/creator" className="text-[11px] tracking-[0.1em] uppercase bg-accent text-bg px-5 py-2 hover:bg-accent-mid transition-colors">
            Publish yours
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-32 pb-20 px-20 max-w-[1280px] mx-auto border-b border-border">
        <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-8">
          Mindset Marketplace
        </p>
        <h1 className="font-serif text-[clamp(42px,5.5vw,72px)] font-normal leading-[1.08] tracking-tight mb-7">
          Install expertise.<br />
          <em className="italic text-accent-mid">Not employees.</em>
        </h1>
        <p className="text-sm text-muted leading-[1.85] max-w-[520px]">
          Verified professionals publish their judgment as a living Mindset.
          Subscribe and your AI thinks like them — layered on top of your personal context.
          Updated continuously as their thinking evolves.
        </p>
      </div>

      {/* Featured Section */}
      {featured.length > 0 && (
        <div className="max-w-[1280px] mx-auto px-20 py-16 border-b border-border">
          <p className="text-[10px] tracking-[0.2em] uppercase text-border-dark mb-6">
            Featured Mindsets
          </p>
          <div className="grid grid-cols-3 gap-px bg-border border border-border">
            {featured.map((m) => (
              <MindsetCard
                key={m.id}
                slug={m.slug}
                name={m.name}
                creator={m.creator_name}
                creatorHandle={m.creator_handle}
                domain={m.domain}
                description={m.description}
                triggerCount={m.trigger_count}
                subscriberCount={m.subscriber_count}
                priceCents={m.price_cents}
                verified={m.verified}
                lastUpdated={formatTimeAgo(m.last_updated_at)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Filter + Sort Bar */}
      <div className="max-w-[1280px] mx-auto px-20 py-8 border-b border-border flex justify-between items-center">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors ${
                category === cat
                  ? "border-accent text-accent bg-accent-light"
                  : "border-border text-muted hover:border-border-dark hover:text-text"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-[11px] text-muted bg-transparent border border-border px-3 py-1.5 font-mono focus:outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Mindset Grid */}
      <div className="max-w-[1280px] mx-auto px-20 py-12">
        {loading ? (
          <p className="text-muted text-sm text-center py-20">Loading mindsets...</p>
        ) : sorted.length === 0 ? (
          <p className="text-muted text-sm text-center py-20">
            No mindsets found{category !== "All" ? ` in ${category}` : ""}.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-px bg-border border border-border">
            {sorted.map((m) => (
              <MindsetCard
                key={m.id}
                slug={m.slug}
                name={m.name}
                creator={m.creator_name}
                creatorHandle={m.creator_handle}
                domain={m.domain}
                description={m.description}
                triggerCount={m.trigger_count}
                subscriberCount={m.subscriber_count}
                priceCents={m.price_cents}
                verified={m.verified}
                lastUpdated={formatTimeAgo(m.last_updated_at)}
              />
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="bg-accent py-28 px-20 text-center">
        <h2 className="font-serif text-[clamp(36px,5vw,62px)] font-normal leading-[1.1] text-bg mb-6">
          Publish your<br /><em className="italic text-bg/40">Mindset.</em>
        </h2>
        <p className="text-sm text-bg/50 mb-8 max-w-md mx-auto">
          Are you a verified professional with expertise worth subscribing to?
          Publish your judgment as a Mindset. Earn 70% of every subscription.
        </p>
        <Link href="/creator" className="inline-block bg-bg text-accent px-8 py-3 text-[11px] tracking-[0.12em] uppercase hover:bg-bg2 transition-colors">
          Apply to publish
        </Link>
      </div>

      {/* Footer */}
      <footer className="max-w-[1280px] mx-auto border-t border-border py-7 px-20 flex justify-between items-center">
        <Link href="/" className="font-mono text-xs tracking-wider text-text">
          know<span className="text-accent-mid">.help</span>
        </Link>
        <div className="flex gap-7">
          <Link href="/mindsets" className="text-[11px] text-muted hover:text-text transition-colors">Mindsets</Link>
          <Link href="/creator" className="text-[11px] text-muted hover:text-text transition-colors">Publish</Link>
          <Link href="https://github.com/know-help/know-help" className="text-[11px] text-muted hover:text-text transition-colors">GitHub</Link>
          <Link href="/setup" className="text-[11px] text-muted hover:text-text transition-colors">Setup</Link>
        </div>
        <span className="text-[11px] text-border-dark">&copy; 2026 know.help</span>
      </footer>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
}

// Sample data for development
const SAMPLE_MINDSETS: Mindset[] = [
  {
    id: "1",
    slug: "brand-design-judgment",
    name: "Brand Design Judgment",
    description: "15 years of taste filters, logo criteria, typography decisions, and critique frameworks — from a working brand director.",
    domain: "Brand Design",
    creator_handle: "maya-reyes",
    creator_name: "Maya Reyes",
    verified: true,
    price_cents: 2900,
    subscriber_count: 142,
    trigger_count: 11,
    file_count: 11,
    last_updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    featured: true,
  },
  {
    id: "2",
    slug: "b2b-growth-operator",
    name: "B2B Growth Operator",
    description: "Cold outreach, ICP qualification, pipeline logic, and conversion psychology from someone who's built it at scale.",
    domain: "Growth Marketing",
    creator_handle: "james-kirk",
    creator_name: "James Kirk",
    verified: true,
    price_cents: 3900,
    subscriber_count: 89,
    trigger_count: 14,
    file_count: 9,
    last_updated_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    featured: true,
  },
  {
    id: "3",
    slug: "operator-core",
    name: "Operator Core",
    description: "Identity, venture, and planning frameworks for solo operators running lean. The foundation Mindset — free forever.",
    domain: "Operations",
    creator_handle: "know-help",
    creator_name: "know.help",
    verified: true,
    price_cents: 0,
    subscriber_count: 384,
    trigger_count: 8,
    file_count: 6,
    last_updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    featured: true,
  },
];
