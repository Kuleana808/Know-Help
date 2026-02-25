"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import SubscribeModal from "@/components/subscribe-modal";
import { apiFetch } from "@/lib/api";

interface MindsetDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  domain: string;
  tags: string[];
  triggers: string[];
  creator_handle: string;
  creator_name: string;
  creator_headline: string;
  creator_bio: string;
  verified: boolean;
  price_cents: number;
  subscriber_count: number;
  file_count: number;
  version: string;
  last_updated_at: string;
  files: Array<{
    filepath: string;
    name: string;
    load_for: string;
    description: string;
  }>;
  previews: Array<{
    title: string;
    items: Array<{ label: string; text: string }>;
  }>;
}

export default function MindsetDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [mindset, setMindset] = useState<MindsetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadMindset();
  }, [slug]);

  async function loadMindset() {
    try {
      const data = await apiFetch<MindsetDetail>(`/api/mindsets/detail/${slug}`);
      setMindset(data);
    } catch {
      // Use sample data for development
      setMindset(SAMPLE_DETAIL);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dk-bg flex items-center justify-center">
        <p className="text-dk-mid text-sm">Loading...</p>
      </div>
    );
  }

  if (!mindset) {
    return (
      <div className="min-h-screen bg-dk-bg flex items-center justify-center">
        <p className="text-dk-mid text-sm">Mindset not found.</p>
      </div>
    );
  }

  const price = mindset.price_cents === 0 ? "Free" : `$${(mindset.price_cents / 100).toFixed(0)}/mo`;
  const updatedAgo = formatTimeAgo(mindset.last_updated_at);

  return (
    <div className="min-h-screen bg-dk-bg text-dk-text">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-12 py-5 flex justify-between items-center transition-all bg-dk-bg/90 backdrop-blur-md border-b border-dk-border">
        <Link href="/" className="font-mono text-[13px] tracking-wider text-dk-text">
          know<span className="text-warm">.help</span>
        </Link>
        <div className="flex gap-7 items-center">
          <Link href="/mindsets" className="text-[11px] tracking-[0.1em] uppercase text-dk-mid hover:text-dk-text transition-colors">
            All Mindsets
          </Link>
          <Link href="/creator" className="text-[11px] tracking-[0.1em] uppercase text-dk-mid hover:text-dk-text transition-colors">
            Publish yours
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className="text-[11px] tracking-[0.1em] uppercase bg-warm text-dk-bg px-5 py-2 hover:opacity-90 transition-opacity"
          >
            Subscribe {price}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="border-b border-dk-border">
        <div className="max-w-[1280px] mx-auto pt-[120px] pb-20 px-20 grid grid-cols-[1fr_400px] gap-20 items-start">
          {/* Left */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-full bg-warm-dim flex items-center justify-center text-xs text-warm font-serif italic">
                {mindset.creator_name.charAt(0)}
              </div>
              <div className="text-xs text-dk-mid tracking-wide">
                <Link href={`/creators/${mindset.creator_handle}`} className="text-warm no-underline hover:underline">
                  {mindset.creator_name}
                </Link>
                {" "}&middot; {mindset.creator_headline}
              </div>
              {mindset.verified && (
                <span className="text-[9px] tracking-[0.14em] uppercase text-kh-green bg-kh-green-dim border border-kh-green px-2 py-0.5">
                  Verified
                </span>
              )}
              <span className="text-[9px] tracking-[0.14em] uppercase text-warm bg-warm-dim border border-warm-dim px-2 py-0.5">
                {mindset.domain}
              </span>
            </div>

            <h1 className="font-serif text-[clamp(48px,6vw,80px)] font-normal leading-[1.05] tracking-tight mb-6">
              {mindset.name.split(" ").slice(0, -1).join(" ")}<br />
              <em className="italic text-warm">{mindset.name.split(" ").slice(-1)[0]}</em>
            </h1>

            <p className="text-sm text-dk-mid leading-[1.85] max-w-[480px] mb-10">
              {mindset.description}
            </p>

            <div className="flex flex-wrap gap-2 mb-10">
              {mindset.triggers.map((t, i) => (
                <span
                  key={t}
                  className={`text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 border ${
                    i < 3
                      ? "text-warm border-warm-dim bg-warm-dim"
                      : "text-dk-dim border-dk-border"
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>

            <p className="text-[11px] text-dk-dim">
              Mindset activates automatically when these topics come up in your AI conversations.
            </p>
          </div>

          {/* Subscribe Card */}
          <div className="bg-dk-surface border border-dk-border p-9 sticky top-20" id="subscribe">
            <div className="mb-6 pb-6 border-b border-dk-border">
              <p className="font-serif text-[42px] font-normal text-dk-text mb-1">{price.replace("/mo", "")}</p>
              <p className="text-[11px] text-dk-mid tracking-wide">
                {mindset.price_cents === 0 ? "free forever" : "per month · cancel anytime"}
              </p>
            </div>

            <div className="mb-6">
              {[
                { label: "Creator", value: mindset.creator_name },
                { label: "Domain", value: mindset.domain },
                { label: "Files", value: `${mindset.file_count} judgment files` },
                { label: "Triggers", value: `${mindset.triggers.length} topics` },
                { label: "Version", value: `v${mindset.version}` },
                { label: "Last updated", value: updatedAgo, highlight: true },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center py-2 border-b border-dk-border text-xs">
                  <span className="text-dk-mid">{row.label}</span>
                  <span className={row.highlight ? "text-kh-green" : "text-dk-text"}>{row.value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowModal(true)}
              className="w-full bg-warm text-dk-bg py-4 font-mono text-xs tracking-[0.12em] uppercase hover:opacity-90 transition-opacity mb-3"
            >
              Subscribe & Install
            </button>

            <div className="bg-dk-bg border border-dk-border p-4 mb-3 relative">
              <p className="text-[9px] tracking-[0.14em] uppercase text-dk-dim mb-1.5">After subscribing, run:</p>
              <p className="text-xs text-dk-mid">
                <span className="text-warm">know install</span>{" "}
                <span className="text-dk-text">{mindset.creator_handle}</span>
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`know install ${mindset.creator_handle}`);
                }}
                className="absolute top-2.5 right-2.5 text-[9px] tracking-[0.1em] uppercase text-dk-dim border border-dk-border px-2 py-1 hover:text-warm hover:border-warm-dim transition-colors"
              >
                Copy
              </button>
            </div>

            <p className="text-[11px] text-dk-dim text-center">
              Updates sync automatically. Cancel in one click.
            </p>
          </div>
        </div>
      </div>

      {/* What This Is */}
      <div className="max-w-[1280px] mx-auto grid grid-cols-2 gap-20 px-20 py-20 border-b border-dk-border">
        <div>
          <p className="text-[10px] tracking-[0.22em] uppercase text-warm mb-6">What this is</p>
          <h2 className="font-serif text-[clamp(32px,3.5vw,48px)] font-normal leading-[1.15] tracking-tight mb-7">
            Not a persona.<br /><em className="italic text-warm">A point of view.</em>
          </h2>
          <p className="text-dk-mid leading-[1.85] mb-5 text-sm">
            A Mindset is different from a system prompt or a Claude Project instruction. It&apos;s a
            structured knowledge base of how a specific person actually thinks — their taste filters,
            decision criteria, red lines, and the references they trust.
          </p>
          <p className="text-dk-mid leading-[1.85] text-sm">
            And because this is a <em className="italic text-warm">living</em> Mindset — when the
            creator&apos;s thinking evolves, the files update. Subscribers get the same refinement
            automatically.
          </p>

          <div className="grid grid-cols-2 gap-px bg-dk-border border border-dk-border mt-9">
            <div className="bg-dk-bg p-5">
              <p className="text-[9px] tracking-[0.16em] uppercase text-dk-dim mb-2.5">This Mindset</p>
              <p className="text-xs text-kh-green leading-relaxed mb-1.5">Specific taste filters</p>
              <p className="text-xs text-kh-green leading-relaxed mb-1.5">Named red lines</p>
              <p className="text-xs text-kh-green leading-relaxed mb-1.5">Critique that commits</p>
              <p className="text-xs text-kh-green leading-relaxed">Updated as thinking evolves</p>
            </div>
            <div className="bg-dk-bg p-5">
              <p className="text-[9px] tracking-[0.16em] uppercase text-dk-dim mb-2.5">Generic AI</p>
              <p className="text-xs text-dk-dim leading-relaxed mb-1.5">Consider best practices</p>
              <p className="text-xs text-dk-dim leading-relaxed mb-1.5">It depends on context</p>
              <p className="text-xs text-dk-dim leading-relaxed mb-1.5">Both approaches have merit</p>
              <p className="text-xs text-dk-dim leading-relaxed">Same answer every time</p>
            </div>
          </div>
        </div>

        {/* Conversation Demo */}
        <div>
          <div className="bg-dk-surface border border-dk-border overflow-hidden">
            <div className="bg-dk-bg2 border-b border-dk-border px-5 py-3 flex items-center gap-2.5">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#e8756a]" />
                <div className="w-2 h-2 rounded-full bg-[#e8b84b]" />
                <div className="w-2 h-2 rounded-full bg-[#5cad6e]" />
              </div>
              <span className="text-[11px] text-dk-mid ml-1">Claude Desktop &middot; {mindset.name} active</span>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <ChatMsg role="user">
                Is this logo working? It uses a thin sans-serif with a gradient and a little abstract mark to the left.
              </ChatMsg>
              <ChatMsg role="ai">
                Three problems. First: thin sans + gradient is the default mode for forgettable SaaS logos — it passes no ownership test. Second: an abstract mark you have to explain is a distraction, not an asset. Third: at 16px in a browser tab, both disappear.
                <br /><br />
                What&apos;s the company actually <em>doing</em>? Start with the positioning, not the aesthetics.
              </ChatMsg>
              <ChatMsg role="user">
                It&apos;s a law firm for startups. They want to look modern, not stuffy.
              </ChatMsg>
              <ChatMsg role="ai">
                &ldquo;Modern not stuffy&rdquo; is what every law firm says. The opportunity is specificity — not looking like a tech company, but looking like the one law firm that actually understands how startups work.
                <br /><br />
                Recommendation: drop the gradient and the abstract mark. Get a distinctive wordmark that reads clearly at 16px and looks like it belongs in a cap table document. Own the precision angle, not the approachability angle.
              </ChatMsg>
            </div>
          </div>
          <p className="text-[11px] text-dk-dim mt-3 text-center">
            This is what the Mindset produces. Not hedging — actual judgment.
          </p>
        </div>
      </div>

      {/* Files List */}
      <div className="max-w-[1280px] mx-auto px-20 py-20 border-b border-dk-border">
        <div className="grid grid-cols-2 gap-20 mb-12">
          <div>
            <p className="text-[10px] tracking-[0.22em] uppercase text-warm mb-6">What&apos;s inside</p>
            <h2 className="font-serif text-[clamp(28px,3vw,40px)] font-normal leading-tight">
              {mindset.file_count} judgment files<br />
              <em className="italic text-warm">across multiple domains.</em>
            </h2>
          </div>
          <p className="text-dk-mid leading-[1.85] text-sm mt-4">
            Each file loads automatically when the topic comes up. The trigger system means only
            relevant context surfaces — not the whole thing, every time.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-dk-border border border-dk-border">
          {mindset.files.map((f) => (
            <div key={f.filepath} className="bg-dk-bg p-6 hover:bg-dk-surface transition-colors">
              <p className="text-[11px] text-warm mb-1.5">{f.filepath}</p>
              <p className="text-sm text-dk-text mb-2">{f.name}</p>
              <p className="text-[10px] text-dk-dim mb-2.5">
                Load for: <span className="text-dk-mid">{f.load_for}</span>
              </p>
              <p className="text-xs text-dk-mid leading-[1.65]">{f.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-[1280px] mx-auto px-20 py-20 border-b border-dk-border">
        <p className="text-[10px] tracking-[0.22em] uppercase text-warm mb-6">How it works</p>
        <h2 className="font-serif text-[clamp(28px,3vw,40px)] font-normal leading-tight mb-3">
          Subscribed once.<br /><em className="italic text-warm">Runs forever.</em>
        </h2>
        <p className="text-dk-mid leading-[1.8] max-w-[540px] mb-14 text-sm">
          A Mindset isn&apos;t a one-time download. It&apos;s a living relationship between you and a
          creator&apos;s evolving expertise. Every refinement they make — you get automatically.
        </p>

        <div className="grid grid-cols-3 gap-px bg-dk-border border border-dk-border">
          <div className="bg-dk-bg p-9">
            <p className="text-[10px] tracking-[0.16em] text-warm mb-4">01 / Subscribe</p>
            <h3 className="font-serif text-xl font-normal mb-3.5 leading-tight">
              One checkout.<br /><em className="italic text-warm">One command.</em>
            </h3>
            <p className="text-xs text-dk-mid leading-[1.75] mb-5">
              Subscribe on this page, then run the install command. The Mindset merges into your knowledge base.
            </p>
            <div className="bg-dk-bg2 border border-dk-border p-3.5 text-[11px] leading-[1.8]">
              <div className="text-dk-dim"># after subscribing:</div>
              <div><span className="text-warm">know install</span> <span className="text-dk-text">{mindset.creator_handle}</span></div>
              <div className="text-dk-dim"># {mindset.file_count} files installed</div>
            </div>
          </div>
          <div className="bg-dk-bg p-9">
            <p className="text-[10px] tracking-[0.16em] text-warm mb-4">02 / Use it</p>
            <h3 className="font-serif text-xl font-normal mb-3.5 leading-tight">
              Activates on<br /><em className="italic text-warm">the right topics.</em>
            </h3>
            <p className="text-xs text-dk-mid leading-[1.75] mb-5">
              Mention relevant topics — the right judgment files surface automatically. Claude doesn&apos;t load everything. Just what&apos;s relevant.
            </p>
            <div className="bg-dk-bg2 border border-dk-border p-3.5 text-[11px] leading-[1.8]">
              <div className="text-dk-dim">// you: &ldquo;is this logo working?&rdquo;</div>
              <div><span className="text-warm">search_mindset</span><span className="text-dk-text">(&ldquo;logo&rdquo;)</span></div>
              <div><span className="text-warm">load_context</span><span className="text-dk-text">(taste-filters.md)</span></div>
            </div>
          </div>
          <div className="bg-dk-bg p-9">
            <p className="text-[10px] tracking-[0.16em] text-warm mb-4">03 / Gets better</p>
            <h3 className="font-serif text-xl font-normal mb-3.5 leading-tight">
              Auto-updates as<br /><em className="italic text-warm">thinking evolves.</em>
            </h3>
            <p className="text-xs text-dk-mid leading-[1.75] mb-5">
              When the creator refines the Mindset, subscribers get the update automatically on next sync.
            </p>
            <div className="bg-dk-bg2 border border-dk-border p-3.5 text-[11px] leading-[1.8]">
              <div className="text-dk-dim"># runs daily in background:</div>
              <div><span className="text-warm">know sync</span></div>
              <div className="text-dk-dim"># v{mindset.version} updated</div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-dk-border border-b border-dk-border">
        <div className="max-w-[1280px] mx-auto px-20 py-20 flex items-center justify-between gap-16">
          <div>
            <h2 className="font-serif text-[clamp(36px,4vw,56px)] font-normal leading-[1.1] mb-4">
              Your AI is running<br /><em className="italic text-warm">without this.</em>
            </h2>
            <p className="text-dk-mid leading-[1.8] max-w-[440px] text-sm">
              Every decision you make through Claude today is filtered through a generalist&apos;s judgment.
              This Mindset changes that. {price}. Cancel anytime. Updates automatically.
            </p>
          </div>
          <div className="flex flex-col gap-4 min-w-[320px]">
            <button
              onClick={() => setShowModal(true)}
              className="block bg-warm text-dk-bg py-4 px-9 font-mono text-xs tracking-[0.12em] uppercase text-center hover:opacity-90 transition-opacity"
            >
              Subscribe & Install — {price}
            </button>
            <p className="text-[11px] text-dk-dim text-center">
              Or browse other Mindsets at{" "}
              <Link href="/mindsets" className="text-warm no-underline">know.help/mindsets</Link>
            </p>
            <p className="text-[11px] text-dk-dim text-center mt-2">
              Are you an expert?{" "}
              <Link href="/creator" className="text-warm no-underline">Publish your Mindset</Link>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-[1280px] mx-auto border-t border-dk-border py-8 px-20 flex justify-between items-center">
        <Link href="/" className="font-mono text-[13px] tracking-wider text-dk-text">
          know<span className="text-warm">.help</span>
        </Link>
        <div className="flex gap-6">
          <Link href="/mindsets" className="text-[11px] text-dk-mid hover:text-dk-text transition-colors">Mindsets</Link>
          <Link href="/creator" className="text-[11px] text-dk-mid hover:text-dk-text transition-colors">Publish</Link>
          <Link href="https://github.com/know-help/know-help" className="text-[11px] text-dk-mid hover:text-dk-text transition-colors">GitHub</Link>
          <Link href="/setup" className="text-[11px] text-dk-mid hover:text-dk-text transition-colors">Setup</Link>
        </div>
        <span className="text-[11px] text-dk-dim">&copy; 2026 know.help</span>
      </footer>

      {/* Subscribe Modal */}
      <SubscribeModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        mindsetSlug={mindset.slug}
        mindsetName={mindset.name}
        creatorName={mindset.creator_name}
        priceCents={mindset.price_cents}
        domain={mindset.domain}
        fileCount={mindset.file_count}
      />
    </div>
  );
}

function ChatMsg({ role, children }: { role: "user" | "ai"; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <div className={`text-[10px] tracking-wide pt-0.5 flex-shrink-0 ${
        role === "user" ? "text-dk-dim" : "text-warm"
      }`}>
        {role === "user" ? "You" : "AI"}
      </div>
      <div className={`text-xs leading-[1.65] p-3 px-4 ${
        role === "user"
          ? "bg-dk-bg2 border border-dk-border text-dk-text"
          : "bg-dk-bg border border-dk-border text-dk-mid"
      }`}>
        {children}
      </div>
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
const SAMPLE_DETAIL: MindsetDetail = {
  id: "1",
  slug: "brand-design-judgment",
  name: "Brand Design Judgment",
  description: "15 years of taste filters, decision criteria, and critique frameworks — distilled into a living Mindset. When you work on your brand and ask Claude \"is this logo working?\" — you get an actual answer, not a hedge.",
  domain: "Brand Design",
  tags: ["design", "brand", "visual identity"],
  triggers: ["brand", "logo", "typography", "color palette", "identity", "visual", "font", "wordmark", "rebrand", "design critique"],
  creator_handle: "maya-reyes",
  creator_name: "Maya Reyes",
  creator_headline: "Brand Director",
  creator_bio: "15 years in brand design. Worked with 200+ companies from startups to Fortune 500.",
  verified: true,
  price_cents: 2900,
  subscriber_count: 142,
  file_count: 11,
  version: "1.4.2",
  last_updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  files: [
    { filepath: "core/philosophy.md", name: "Brand Design Philosophy", load_for: "brand, identity, design, visual", description: "The foundational position on what brand design actually is and what it's for." },
    { filepath: "core/taste-filters.md", name: "The 6 Taste Filters", load_for: "logo, identity, brand, visual", description: "Named criteria for evaluating any brand identity work." },
    { filepath: "logo/red-lines.md", name: "Logo Red Lines", load_for: "logo, wordmark, mark, icon", description: "Specific logo approaches that never work and why." },
    { filepath: "logo/process.md", name: "Logo Development Process", load_for: "logo design, brand design process", description: "How to run a logo project — brief to approval." },
    { filepath: "typography/principles.md", name: "Typography Principles", load_for: "typography, font, typeface", description: "How to make type decisions that carry character." },
    { filepath: "typography/pairings.md", name: "Type Pairing Reference", load_for: "font pairing, display font", description: "Specific pairings that work and why." },
    { filepath: "color/approach.md", name: "Color Approach", load_for: "color, palette, color system", description: "How to build a color system that works across contexts." },
    { filepath: "voice/critique.md", name: "Design Critique Framework", load_for: "critique, feedback, review", description: "How useful design critique works." },
    { filepath: "voice/client.md", name: "Client Communication Patterns", load_for: "client, presentation", description: "How to talk about design decisions with clients." },
    { filepath: "reference/canon.md", name: "Reference Canon", load_for: "reference, inspiration, examples", description: "Named brands and designers that calibrate the taste." },
    { filepath: "reference/positioning.md", name: "Brand Positioning Integration", load_for: "positioning, strategy", description: "How design decisions connect to positioning." },
  ],
  previews: [],
};
