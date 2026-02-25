"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";

interface Submission {
  id: string;
  name: string;
  author_handle: string;
  version: string;
  price_cents: number;
  category: string;
  description: string;
  created_at: string;
  status: string;
}

export default function AdminPage() {
  const { data, loading, refetch } = useApi<{ submissions: Submission[] }>(
    "/portal/admin/submissions"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);

  async function approve(id: string) {
    setProcessing(true);
    try {
      await apiFetch(`/portal/admin/approve`, {
        method: "POST",
        body: { pack_id: id },
      });
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessing(false);
      setSelectedId(null);
    }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) {
      alert("Please provide a reason for rejection");
      return;
    }
    setProcessing(true);
    try {
      await apiFetch(`/portal/admin/reject`, {
        method: "POST",
        body: { pack_id: id, reason: rejectReason },
      });
      setRejectReason("");
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessing(false);
      setSelectedId(null);
    }
  }

  const pending =
    data?.submissions?.filter((s) => s.status === "pending") || [];

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="font-serif text-3xl mb-2">Admin: Submission Queue</h1>
      <p className="text-sm text-muted mb-8">
        Review and approve knowledge pack submissions.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : pending.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-muted">No pending submissions.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((sub) => (
            <div key={sub.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium">{sub.name}</h3>
                  <p className="text-sm text-muted mt-1">{sub.description}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => approve(sub.id)}
                    disabled={processing}
                    className="btn-primary text-xs"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() =>
                      setSelectedId(selectedId === sub.id ? null : sub.id)
                    }
                    className="btn-secondary text-xs"
                  >
                    Reject
                  </button>
                </div>
              </div>
              <div className="flex gap-3 text-xs text-muted">
                <span>by {sub.author_handle}</span>
                <span>v{sub.version}</span>
                <span>{sub.category}</span>
                <span>
                  {sub.price_cents === 0
                    ? "Free"
                    : `$${(sub.price_cents / 100).toFixed(2)}`}
                </span>
                <span>
                  {new Date(sub.created_at).toLocaleDateString()}
                </span>
              </div>

              {selectedId === sub.id && (
                <div className="mt-4 p-3 bg-bg rounded">
                  <label className="label">Rejection reason</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="input resize-none h-20 mb-2"
                    placeholder="Explain why this pack was rejected..."
                  />
                  <button
                    onClick={() => reject(sub.id)}
                    disabled={processing}
                    className="btn-secondary text-xs"
                  >
                    Confirm rejection
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
