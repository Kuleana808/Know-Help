"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function SubmitPackPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("productivity");
  const [price, setPrice] = useState("0");
  const [files, setFiles] = useState<{ filename: string; content: string }[]>([
    { filename: "", content: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const packJson = {
        name: name.toLowerCase().replace(/\s+/g, "-"),
        display_name: name,
        version: "1.0.0",
        description,
        author: "creator",
        category,
        price_cents: Math.round(parseFloat(price) * 100),
        files: files
          .filter((f) => f.filename.trim())
          .map((f) => ({
            src: f.filename,
            dest: f.filename,
            merge_strategy: "replace",
          })),
      };

      await apiFetch("/portal/packs/submit", {
        method: "POST",
        body: {
          pack_json: packJson,
          files: files.filter((f) => f.filename.trim()),
        },
      });

      router.push("/portal");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="font-serif text-3xl mb-2">Submit a pack</h1>
      <p className="text-sm text-muted mb-8">
        Create a knowledge pack to share with the community.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="label">Pack name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="My Sales Playbook"
            required
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input resize-none h-24"
            placeholder="What does this pack help with?"
            required
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="label">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input"
            >
              <option value="productivity">Productivity</option>
              <option value="sales">Sales</option>
              <option value="marketing">Marketing</option>
              <option value="engineering">Engineering</option>
              <option value="leadership">Leadership</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="label">Price (USD)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input"
              placeholder="0 for free"
            />
          </div>
        </div>

        {/* Files */}
        <div>
          <label className="label">Files</label>
          <div className="space-y-4">
            {files.map((file, i) => (
              <div key={i} className="p-3 bg-bg rounded space-y-2">
                <input
                  value={file.filename}
                  onChange={(e) => {
                    const next = [...files];
                    next[i].filename = e.target.value;
                    setFiles(next);
                  }}
                  className="input"
                  placeholder="filename.md (e.g., sales/playbook.md)"
                />
                <textarea
                  value={file.content}
                  onChange={(e) => {
                    const next = [...files];
                    next[i].content = e.target.value;
                    setFiles(next);
                  }}
                  className="input resize-none h-32 font-mono text-xs"
                  placeholder="File content (markdown)..."
                />
              </div>
            ))}
            {files.length < 20 && (
              <button
                type="button"
                onClick={() =>
                  setFiles([...files, { filename: "", content: "" }])
                }
                className="text-sm text-accent hover:underline"
              >
                + Add another file
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Submitting..." : "Submit for review"}
          </button>
        </div>
      </form>
    </div>
  );
}
