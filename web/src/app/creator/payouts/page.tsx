"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

interface PayoutData {
  total_earned_cents: number;
  total_paid_cents: number;
  pending_cents: number;
  mindsets: Array<{
    name: string;
    subscriber_count: number;
    revenue_cents: number;
  }>;
}

export default function PayoutsPage() {
  const [data, setData] = useState<PayoutData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPayouts();
  }, []);

  async function loadPayouts() {
    try {
      const result = await apiFetch<PayoutData>("/api/mindsets/creators/me");
      setData(result);
    } catch {
      setData({
        total_earned_cents: 0,
        total_paid_cents: 0,
        pending_cents: 0,
        mindsets: [],
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-12 max-w-3xl">
      <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
        Payouts
      </p>
      <h1 className="font-serif text-3xl mb-8">Earnings & Payouts</h1>

      <div className="grid grid-cols-3 gap-px bg-border border border-border mb-10">
        <div className="bg-bg p-6">
          <p className="text-[10px] tracking-[0.14em] uppercase text-border-dark mb-2">
            Total Earned
          </p>
          <p className="font-serif text-3xl font-normal">
            ${((data?.total_earned_cents || 0) / 100).toFixed(0)}
          </p>
        </div>
        <div className="bg-bg p-6">
          <p className="text-[10px] tracking-[0.14em] uppercase text-border-dark mb-2">
            Total Paid Out
          </p>
          <p className="font-serif text-3xl font-normal">
            ${((data?.total_paid_cents || 0) / 100).toFixed(0)}
          </p>
        </div>
        <div className="bg-bg p-6">
          <p className="text-[10px] tracking-[0.14em] uppercase text-border-dark mb-2">
            Pending
          </p>
          <p className="font-serif text-3xl font-normal text-accent">
            ${((data?.pending_cents || 0) / 100).toFixed(0)}
          </p>
        </div>
      </div>

      {/* Revenue by Mindset */}
      <h2 className="font-serif text-xl mb-4">Revenue by Mindset</h2>
      {(data?.mindsets || []).length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-muted text-sm">No revenue yet. Publish a Mindset to start earning.</p>
        </div>
      ) : (
        <div className="border border-border">
          <div className="grid grid-cols-3 gap-px bg-border">
            <div className="bg-bg2 p-3 text-[10px] tracking-[0.12em] uppercase text-muted">
              Mindset
            </div>
            <div className="bg-bg2 p-3 text-[10px] tracking-[0.12em] uppercase text-muted">
              Subscribers
            </div>
            <div className="bg-bg2 p-3 text-[10px] tracking-[0.12em] uppercase text-muted">
              Revenue (your 70%)
            </div>
          </div>
          {data!.mindsets.map((m) => (
            <div key={m.name} className="grid grid-cols-3 gap-px bg-border">
              <div className="bg-bg p-3 text-sm">{m.name}</div>
              <div className="bg-bg p-3 text-sm">{m.subscriber_count}</div>
              <div className="bg-bg p-3 text-sm text-accent">
                ${(m.revenue_cents / 100).toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stripe Dashboard Link */}
      <div className="card mt-10">
        <h3 className="font-serif text-lg mb-2">Stripe Dashboard</h3>
        <p className="text-xs text-muted mb-4">
          View detailed payout history, update bank information, and manage your connected account.
        </p>
        <button className="btn-secondary text-xs">
          Open Stripe Dashboard
        </button>
      </div>

      <p className="text-[11px] text-border-dark mt-6">
        Payouts are processed automatically via Stripe. You earn 70% of each subscription.
        Payouts occur on a rolling basis as Stripe processes payments.
      </p>
    </div>
  );
}
