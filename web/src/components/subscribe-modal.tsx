"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  mindsetSlug: string;
  mindsetName: string;
  creatorName: string;
  priceCents: number;
  domain: string;
  fileCount: number;
}

export default function SubscribeModal({
  isOpen,
  onClose,
  mindsetSlug,
  mindsetName,
  creatorName,
  priceCents,
  domain,
  fileCount,
}: SubscribeModalProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const price = priceCents === 0 ? "Free" : `$${(priceCents / 100).toFixed(0)}/mo`;

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ checkout_url?: string; install_token?: string }>(
        "/api/mindsets/subscribe",
        {
          method: "POST",
          body: { mindset_slug: mindsetSlug, email },
        }
      );
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      } else if (res.install_token) {
        // Free mindset — redirect to success page
        window.location.href = `/mindsets/success?token=${res.install_token}&slug=${mindsetSlug}`;
      }
    } catch (err: any) {
      setError(err.message || "Subscription failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#1a1916] border border-[#2a2820] max-w-md w-full mx-4 p-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#4a4840] hover:text-[#8a857c] text-sm"
        >
          Close
        </button>

        <p className="text-[10px] tracking-[0.22em] uppercase text-[#c8a86a] mb-4">
          Subscribe to Mindset
        </p>

        <h3 className="font-serif text-2xl text-[#e8e4da] mb-2">{mindsetName}</h3>
        <p className="text-[12px] text-[#8a857c] mb-6">
          by {creatorName} &middot; {domain} &middot; {fileCount} files
        </p>

        <div className="border-t border-[#2a2820] pt-6 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[12px] text-[#8a857c]">Price</span>
            <span className="font-serif text-xl text-[#e8e4da]">{price}</span>
          </div>
          <p className="text-[11px] text-[#4a4840]">
            Cancel anytime. Updates sync automatically.
          </p>
        </div>

        <form onSubmit={handleSubscribe}>
          <label className="block text-[11px] text-[#8a857c] mb-2 tracking-wide">
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full bg-[#0d0c09] border border-[#2a2820] text-[#e8e4da] px-4 py-3 text-[13px] font-mono mb-4 focus:outline-none focus:border-[#6a5830] placeholder:text-[#2a2820]"
          />

          {error && (
            <p className="text-[12px] text-red-400 mb-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#c8a86a] text-[#0d0c09] py-4 font-mono text-[12px] tracking-[0.12em] uppercase hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Processing..." : `Subscribe & Install — ${price}`}
          </button>
        </form>

        <p className="text-[10px] text-[#4a4840] text-center mt-4">
          Secure checkout via Stripe. 70% goes directly to the creator.
        </p>
      </div>
    </div>
  );
}
