"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";

interface Contact {
  slug: string;
  name: string;
  last_interaction: string;
  entry_count: number;
}

interface ContactDetail {
  slug: string;
  entries: {
    date: string;
    name: string;
    notes: string;
  }[];
}

export default function NetworkPage() {
  const { data, loading, refetch } = useApi<{ contacts: Contact[] }>(
    "/api/network/contacts"
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);

  async function loadContact(slug: string) {
    try {
      const res = await apiFetch<ContactDetail>(`/api/network/${slug}`);
      setDetail(res);
      setSelected(slug);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function addNote() {
    if (!selected || !newNote.trim()) return;
    setAdding(true);
    try {
      await apiFetch(`/api/network/${selected}/add`, {
        method: "POST",
        body: { notes: newNote },
      });
      setNewNote("");
      await loadContact(selected);
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6">Network</h1>

      <div className="flex gap-6">
        {/* Contact list */}
        <div className="w-64 shrink-0 space-y-1">
          {loading ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : !data?.contacts?.length ? (
            <p className="text-sm text-muted">No contacts yet</p>
          ) : (
            data.contacts.map((c) => (
              <button
                key={c.slug}
                onClick={() => loadContact(c.slug)}
                className={`block w-full text-left px-3 py-2 rounded transition-colors ${
                  selected === c.slug
                    ? "bg-accent-light text-accent"
                    : "hover:bg-bg2"
                }`}
              >
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted">
                  {c.entry_count} interaction
                  {c.entry_count !== 1 ? "s" : ""}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Contact detail */}
        <div className="flex-1 card">
          {detail ? (
            <div>
              <h2 className="font-serif text-xl mb-4">{detail.entries[0]?.name || selected}</h2>

              {/* Add note */}
              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note about this contact..."
                  className="input flex-1"
                  onKeyDown={(e) => e.key === "Enter" && addNote()}
                />
                <button
                  onClick={addNote}
                  disabled={adding || !newNote.trim()}
                  className="btn-primary"
                >
                  {adding ? "Adding..." : "Add"}
                </button>
              </div>

              {/* Interaction history */}
              <div className="space-y-3">
                {[...detail.entries]
                  .reverse()
                  .filter((e) => !e.notes?.startsWith("{") && e.notes)
                  .map((entry, i) => (
                    <div key={i} className="border-l-2 border-border pl-4 py-1">
                      <p className="text-sm">{entry.notes}</p>
                      <p className="text-xs text-muted mt-1">
                        {new Date(entry.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted text-center py-20">
              Select a contact to view interaction history
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
