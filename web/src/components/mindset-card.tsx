"use client";

import Link from "next/link";

interface MindsetCardProps {
  slug: string;
  name: string;
  creator: string;
  creatorHandle: string;
  domain: string;
  description: string;
  triggerCount: number;
  subscriberCount: number;
  priceCents: number;
  verified: boolean;
  lastUpdated?: string;
}

export default function MindsetCard({
  slug,
  name,
  creator,
  creatorHandle,
  domain,
  description,
  triggerCount,
  subscriberCount,
  priceCents,
  verified,
  lastUpdated,
}: MindsetCardProps) {
  const price = priceCents === 0 ? "Free" : `$${(priceCents / 100).toFixed(0)}/mo`;

  return (
    <Link
      href={`/mindsets/${slug}`}
      className="block bg-bg p-7 transition-colors hover:bg-bg2 group"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[9px] tracking-[0.18em] uppercase text-border-dark">
          {domain}
        </span>
        {verified && (
          <span className="text-[9px] tracking-[0.14em] uppercase text-accent bg-accent-light border border-accent px-1.5 py-0.5">
            Verified
          </span>
        )}
      </div>

      <p className="font-serif text-base font-normal leading-tight mb-2">{name}</p>

      <p className="text-[11px] text-muted leading-[1.7] mb-5 line-clamp-2">
        {description}
      </p>

      <div className="flex justify-between items-center">
        <span className={`text-[13px] ${priceCents === 0 ? "text-accent-mid" : "text-text"}`}>
          {price}
        </span>
        <span className="text-[10px] text-border-dark">
          {lastUpdated ? `Updated ${lastUpdated}` : `${subscriberCount} subscribers`}
        </span>
      </div>
    </Link>
  );
}
