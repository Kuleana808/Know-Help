"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MindsetCard from "@/components/mindset-card";
import { apiFetch } from "@/lib/api";

interface CreatorPublic {
  handle: string;
  display_name: string;
  headline: string;
  domain: string;
  bio: string;
  credentials: string;
  work_samples: string;
  profile_image_url: string;
  verified: boolean;
  subscriber_count: number;
  mindsets: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    domain: string;
    price_cents: number;
    subscriber_count: number;
    trigger_count: number;
    file_count: number;
    last_updated_at: string;
    verified: boolean;
  }>;
}

export default function CreatorProfilePage() {
  const params = useParams();
  const handle = params.handle as string;
  const [creator, setCreator] = useState<CreatorPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCreator();
  }, [handle]);

  async function loadCreator() {
    try {
      const data = await apiFetch<CreatorPublic>(`/api/mindsets/creator/${handle}`);
      setCreator(data);
    } catch {
      setCreator(SAMPLE_CREATOR);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-muted text-sm">Creator not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-12 py-5 flex justify-between items-center bg-bg/90 backdrop-blur-md border-b border-border">
        <Link href="/" className="font-mono text-[13px] tracking-wider text-text">
          know<span className="text-accent-mid">.help</span>
        </Link>
        <div className="flex gap-7 items-center">
          <Link href="/mindsets" className="text-[11px] tracking-[0.1em] uppercase text-muted hover:text-text transition-colors">
            Mindsets
          </Link>
          <Link href="/creator" className="text-[11px] tracking-[0.1em] uppercase bg-accent text-bg px-5 py-2 hover:bg-accent-mid transition-colors">
            Publish yours
          </Link>
        </div>
      </nav>

      {/* Profile Header */}
      <div className="max-w-[1280px] mx-auto pt-32 pb-16 px-20 border-b border-border">
        <div className="flex gap-8 items-start">
          <div className="w-20 h-20 rounded-full bg-accent-light flex items-center justify-center font-serif text-2xl italic text-accent flex-shrink-0">
            {creator.display_name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-serif text-3xl font-normal">{creator.display_name}</h1>
              {creator.verified && (
                <span className="text-[9px] tracking-[0.14em] uppercase text-accent bg-accent-light border border-accent px-2 py-0.5">
                  Verified
                </span>
              )}
            </div>
            <p className="text-sm text-muted mb-4">{creator.headline}</p>
            <p className="text-sm text-muted leading-relaxed max-w-xl mb-4">
              {creator.bio}
            </p>
            {creator.credentials && (
              <div className="mb-4">
                <p className="text-[10px] tracking-[0.14em] uppercase text-border-dark mb-1">
                  Credentials
                </p>
                <p className="text-xs text-muted">{creator.credentials}</p>
              </div>
            )}
            {creator.work_samples && (
              <div>
                <p className="text-[10px] tracking-[0.14em] uppercase text-border-dark mb-1">
                  Work
                </p>
                <div className="flex flex-wrap gap-3">
                  {creator.work_samples.split("\n").filter(Boolean).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:underline"
                    >
                      {new URL(url).hostname}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Published Mindsets */}
      <div className="max-w-[1280px] mx-auto px-20 py-12">
        <p className="text-[10px] tracking-[0.2em] uppercase text-border-dark mb-6">
          Published Mindsets ({creator.mindsets.length})
        </p>

        {creator.mindsets.length === 0 ? (
          <p className="text-muted text-sm py-10">No published Mindsets yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-px bg-border border border-border">
            {creator.mindsets.map((m) => (
              <MindsetCard
                key={m.id}
                slug={m.slug}
                name={m.name}
                creator={creator.display_name}
                creatorHandle={creator.handle}
                domain={m.domain}
                description={m.description}
                triggerCount={m.trigger_count}
                subscriberCount={m.subscriber_count}
                priceCents={m.price_cents}
                verified={m.verified}
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
        </div>
        <span className="text-[11px] text-border-dark">&copy; 2026 know.help</span>
      </footer>
    </div>
  );
}

// Sample data for development
const SAMPLE_CREATOR: CreatorPublic = {
  handle: "maya-reyes",
  display_name: "Maya Reyes",
  headline: "Brand Director, 15 years",
  domain: "Brand Design",
  bio: "I've spent 15 years building brands from the ground up — from early-stage startups to Fortune 500 rebrands. My judgment is built on thousands of logo reviews, identity systems, and brand strategy engagements.",
  credentials: "Former Creative Director at Pentagram. Led brand systems for Stripe, Linear, and Notion.",
  work_samples: "https://mayareyes.design\nhttps://medium.com/@mayareyes",
  profile_image_url: "",
  verified: true,
  subscriber_count: 142,
  mindsets: [
    {
      id: "1",
      slug: "brand-design-judgment",
      name: "Brand Design Judgment",
      description: "15 years of taste filters, logo criteria, typography decisions, and critique frameworks — from a working brand director.",
      domain: "Brand Design",
      price_cents: 2900,
      subscriber_count: 142,
      trigger_count: 11,
      file_count: 11,
      last_updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      verified: true,
    },
  ],
};
