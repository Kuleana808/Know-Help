"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const slug = params.get("slug") || "";

  const configJson = JSON.stringify(
    {
      mcpServers: {
        "know-help": {
          command: "npx",
          args: ["know-help@latest", "serve"],
          env: {
            KNOW_HELP_TOKEN: token,
          },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="min-h-screen bg-dk-bg text-dk-text">
      {/* Nav */}
      <nav className="px-12 py-5 flex justify-between items-center border-b border-dk-border">
        <Link href="/" className="font-mono text-[13px] tracking-wider text-dk-text">
          know<span className="text-warm">.help</span>
        </Link>
        <Link href="/mindsets" className="text-[11px] tracking-[0.1em] uppercase text-dk-mid hover:text-dk-text transition-colors">
          Browse Mindsets
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto py-24 px-8">
        <div className="text-center mb-16">
          <p className="text-[10px] tracking-[0.22em] uppercase text-kh-green mb-6">
            Subscription Active
          </p>
          <h1 className="font-serif text-[clamp(36px,4vw,56px)] font-normal leading-[1.1] mb-6">
            You&apos;re in.<br /><em className="italic text-warm">Let&apos;s get it installed.</em>
          </h1>
          <p className="text-sm text-dk-mid leading-[1.85] max-w-md mx-auto">
            Your subscription is active. Follow the steps below to install the Mindset
            into your Claude Desktop or Cursor setup.
          </p>
        </div>

        {/* Step 1: Install Command */}
        <div className="border border-dk-border mb-6">
          <div className="bg-dk-surface px-6 py-4 border-b border-dk-border flex items-center gap-3">
            <span className="text-[10px] tracking-[0.16em] uppercase text-warm">Step 1</span>
            <span className="text-xs text-dk-mid">Run the install command</span>
          </div>
          <div className="bg-dk-bg p-6 relative">
            <pre className="text-sm text-dk-text font-mono">
              <span className="text-warm">know install</span> {slug}{" "}
              <span className="text-dk-dim">--token</span> {token.substring(0, 12)}...
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`know install ${slug} --token ${token}`);
              }}
              className="absolute top-4 right-4 text-[9px] tracking-[0.1em] uppercase text-dk-dim border border-dk-border px-2.5 py-1 hover:text-warm hover:border-warm-dim transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Step 2: Token */}
        <div className="border border-dk-border mb-6">
          <div className="bg-dk-surface px-6 py-4 border-b border-dk-border flex items-center gap-3">
            <span className="text-[10px] tracking-[0.16em] uppercase text-warm">Step 2</span>
            <span className="text-xs text-dk-mid">Your install token</span>
          </div>
          <div className="bg-dk-bg p-6 relative">
            <p className="text-[11px] text-dk-dim mb-2">Keep this safe — it authenticates your subscription:</p>
            <pre className="text-xs text-warm font-mono break-all">{token}</pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(token);
              }}
              className="absolute top-4 right-4 text-[9px] tracking-[0.1em] uppercase text-dk-dim border border-dk-border px-2.5 py-1 hover:text-warm hover:border-warm-dim transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Step 3: Claude Desktop Config */}
        <div className="border border-dk-border mb-12">
          <div className="bg-dk-surface px-6 py-4 border-b border-dk-border flex items-center gap-3">
            <span className="text-[10px] tracking-[0.16em] uppercase text-warm">Step 3</span>
            <span className="text-xs text-dk-mid">Claude Desktop configuration</span>
          </div>
          <div className="bg-dk-bg p-6 relative">
            <p className="text-[11px] text-dk-dim mb-3">Add this to your Claude Desktop config:</p>
            <pre className="text-[11px] text-dk-mid font-mono whitespace-pre leading-[1.8] overflow-x-auto">
              {configJson}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(configJson);
              }}
              className="absolute top-4 right-4 text-[9px] tracking-[0.1em] uppercase text-dk-dim border border-dk-border px-2.5 py-1 hover:text-warm hover:border-warm-dim transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="text-center space-y-4">
          <Link
            href="/mindsets"
            className="inline-block bg-warm text-dk-bg px-8 py-3 text-xs tracking-[0.12em] uppercase hover:opacity-90 transition-opacity"
          >
            Browse more Mindsets
          </Link>
          <p className="text-[11px] text-dk-dim">
            Need help? Check our{" "}
            <Link href="/setup" className="text-warm">setup guide</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dk-bg" />}>
      <SuccessContent />
    </Suspense>
  );
}
