"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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
}

const CATEGORIES: Record<string, string> = {
  "brand-design": "Brand Design",
  "growth-marketing": "Growth Marketing",
  sales: "Sales",
  operations: "Operations",
  content: "Content",
  engineering: "Engineering",
  finance: "Finance",
  legal: "Legal",
  product: "Product",
};

const SORT_OPTIONS = [
  { value: "subscribers", label: "Most Subscribers" },
  { value: "newest", label: "Newest" },
  { value: "updated", label: "Recently Updated" },
];

export default function CategoryPage() {
  const params = useParams();
  const categorySlug = params.category as string;
  const categoryName = CATEGORIES[categorySlug] || categorySlug;

  const [mindsets, setMindsets] = useState<Mindset[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("subscribers");

  useEffect(() => {
    loadMindsets();
  }, [categorySlug]);

  async function loadMindsets() {
    setLoading(true);
    try {
      const data = await apiFetch<{ mindsets: Mindset[] }>(
        `/api/mindsets/category/${encodeURIComponent(categoryName)}`
      );
      setMindsets(data.mindsets || []);
    } catch {
      setMindsets([]);
    } finally {
      setLoading(false);
    }
  }

  const sorted = [...mindsets].sort((a, b) => {
    switch (sort) {
      case "newest":
        return new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime();
      case "updated":
        return new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime();
      default:
        return b.subscriber_count - a.subscriber_count;
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

      {/* Category Hero */}
      <div className="pt-32 pb-16 px-20 max-w-[1280px] mx-auto border-b border-border">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/mindsets" className="text-[10px] tracking-[0.18em] uppercase text-muted hover:text-text transition-colors">
            Mindsets
          </Link>
          <span className="text-border-dark text-xs">/</span>
          <span className="text-[10px] tracking-[0.18em] uppercase text-accent-mid">
            {categoryName}
          </span>
        </div>
        <h1 className="font-serif text-[clamp(36px,4.5vw,56px)] font-normal leading-[1.1] tracking-tight mb-4">
          {categoryName}
        </h1>
        <p className="text-sm text-muted leading-[1.85] max-w-[480px]">
          Professional judgment from verified {categoryName.toLowerCase()} experts,
          installable as a living Mindset for your AI.
        </p>
      </div>

      {/* Sort + Count Bar */}
      <div className="max-w-[1280px] mx-auto px-20 py-6 border-b border-border flex justify-between items-center">
        <div className="flex gap-3 flex-wrap">
          {Object.entries(CATEGORIES).map(([slug, name]) => (
            <Link
              key={slug}
              href={`/mindsets/category/${slug}`}
              className={`text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors ${
                slug === categorySlug
                  ? "border-accent text-accent bg-accent-light"
                  : "border-border text-muted hover:border-border-dark hover:text-text"
              }`}
            >
              {name}
            </Link>
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
          <div className="text-center py-20">
            <p className="text-muted text-sm mb-4">
              No mindsets published in {categoryName} yet.
            </p>
            <Link
              href="/creator"
              className="inline-block text-[11px] tracking-[0.1em] uppercase border border-accent text-accent px-5 py-2 hover:bg-accent hover:text-bg transition-colors"
            >
              Be the first to publish
            </Link>
          </div>
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
