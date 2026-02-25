"use client";

import { useApi } from "@/lib/hooks";

interface Pack {
  id: string;
  name: string;
  version: string;
  status: string;
  downloads: number;
  price_cents: number;
  created_at: string;
}

export default function CreatorPortalPage() {
  const { data, loading } = useApi<{ packs: Pack[] }>("/portal/packs/mine");

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl">Creator Portal</h1>
          <p className="text-sm text-muted mt-1">
            Manage your knowledge packs
          </p>
        </div>
        <a href="/portal/submit" className="btn-primary">
          Submit new pack
        </a>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : !data?.packs?.length ? (
        <div className="card text-center py-12">
          <p className="text-muted mb-4">You haven&apos;t submitted any packs yet.</p>
          <a href="/portal/submit" className="btn-primary">
            Create your first pack
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {data.packs.map((pack) => (
            <div key={pack.id} className="card flex items-center justify-between">
              <div>
                <h3 className="font-medium">{pack.name}</h3>
                <div className="flex gap-3 text-xs text-muted mt-1">
                  <span>v{pack.version}</span>
                  <span>
                    {pack.price_cents === 0
                      ? "Free"
                      : `$${(pack.price_cents / 100).toFixed(2)}`}
                  </span>
                  <span>{pack.downloads} downloads</span>
                </div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  pack.status === "active"
                    ? "bg-green-100 text-green-700"
                    : pack.status === "pending"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {pack.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
