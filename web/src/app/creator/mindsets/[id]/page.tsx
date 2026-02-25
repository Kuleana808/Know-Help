"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface MindsetFile {
  filepath: string;
  load_for: string;
  content: string;
}

interface MindsetData {
  id: string;
  name: string;
  domain: string;
  version: string;
  status: string;
  subscriber_count: number;
  file_count: number;
  files: MindsetFile[];
}

export default function MindsetEditorPage() {
  const params = useParams();
  const id = params.id as string;
  const [mindset, setMindset] = useState<MindsetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editLoadFor, setEditLoadFor] = useState("");
  const [saving, setSaving] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);

  useEffect(() => {
    loadMindset();
  }, [id]);

  async function loadMindset() {
    try {
      const data = await apiFetch<MindsetData>(`/api/mindsets/${id}/files`);
      setMindset(data);
      if (data.files.length > 0) {
        selectFile(data.files[0]);
      }
    } catch {
      // Will show empty state
    } finally {
      setLoading(false);
    }
  }

  function selectFile(file: MindsetFile) {
    setSelectedFile(file.filepath);
    setEditContent(file.content);
    setEditLoadFor(file.load_for);
  }

  async function handleSave() {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await apiFetch(`/api/mindsets/${id}/save-file`, {
        method: "PUT",
        body: {
          filepath: selectedFile,
          content: editContent,
          load_for: editLoadFor,
        },
      });
      await loadMindset();
    } catch (err: any) {
      alert(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleNewFile() {
    if (!newFilePath) return;
    setSaving(true);
    try {
      await apiFetch(`/api/mindsets/${id}/save-file`, {
        method: "PUT",
        body: {
          filepath: newFilePath,
          content: `---\nLoad for: ${newFilePath.split("/").pop()?.replace(".md", "")}\n---\n\n# ${newFilePath.split("/").pop()?.replace(".md", "")}\n\nAdd your judgment here.\n`,
          load_for: newFilePath.split("/").pop()?.replace(".md", "") || "",
        },
      });
      setNewFilePath("");
      setShowNewFile(false);
      await loadMindset();
    } catch (err: any) {
      alert(err.message || "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    try {
      await apiFetch(`/api/mindsets/${id}`, {
        method: "PUT",
        body: { status: "published" },
      });
      await loadMindset();
    } catch (err: any) {
      alert(err.message || "Publish failed");
    }
  }

  if (loading) {
    return (
      <div className="p-12">
        <p className="text-muted text-sm">Loading editor...</p>
      </div>
    );
  }

  if (!mindset) {
    return (
      <div className="p-12">
        <p className="text-muted text-sm">Mindset not found.</p>
      </div>
    );
  }

  const currentFile = mindset.files.find((f) => f.filepath === selectedFile);

  // Group files by directory
  const groups: Record<string, MindsetFile[]> = {};
  for (const f of mindset.files) {
    const dir = f.filepath.includes("/") ? f.filepath.split("/")[0] : "";
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(f);
  }

  return (
    <div className="flex h-screen">
      {/* File Tree Sidebar */}
      <div className="w-60 border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border">
          <p className="font-serif text-base mb-0.5">{mindset.name}</p>
          <p className="text-[10px] text-muted">
            v{mindset.version} &middot; {mindset.file_count} files &middot;{" "}
            <span className={mindset.status === "published" ? "text-accent" : "text-muted"}>
              {mindset.status}
            </span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {Object.entries(groups).map(([dir, files]) => (
            <div key={dir} className="mb-2">
              {dir && (
                <p className="text-[10px] tracking-[0.12em] uppercase text-border-dark px-2 py-1">
                  {dir}/
                </p>
              )}
              {files.map((f) => (
                <button
                  key={f.filepath}
                  onClick={() => selectFile(f)}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                    selectedFile === f.filepath
                      ? "bg-accent-light text-accent"
                      : "text-muted hover:bg-bg2 hover:text-text"
                  }`}
                >
                  {dir ? f.filepath.substring(dir.length + 1) : f.filepath}
                </button>
              ))}
            </div>
          ))}

          {showNewFile ? (
            <div className="p-2 border-t border-border mt-2">
              <input
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="core/new-file.md"
                className="input text-xs mb-2"
              />
              <div className="flex gap-1">
                <button onClick={handleNewFile} className="btn-primary text-xs py-1 px-2">
                  Create
                </button>
                <button
                  onClick={() => { setShowNewFile(false); setNewFilePath(""); }}
                  className="btn-secondary text-xs py-1 px-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewFile(true)}
              className="w-full text-left px-2 py-1.5 text-xs text-accent hover:bg-accent-light rounded mt-2 transition-colors"
            >
              + Add file
            </button>
          )}
        </div>

        <div className="p-3 border-t border-border space-y-2">
          <button
            onClick={handlePublish}
            disabled={mindset.status === "published" && mindset.file_count >= 5}
            className="btn-primary w-full text-xs"
          >
            {mindset.status === "published" ? "Update published" : "Publish Mindset"}
          </button>
          <p className="text-[10px] text-muted text-center">
            {mindset.subscriber_count} subscriber{mindset.subscriber_count !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Editor Pane */}
      <div className="flex-1 flex flex-col">
        {currentFile ? (
          <>
            <div className="px-6 py-3 border-b border-border flex items-center justify-between bg-surface">
              <div>
                <span className="text-xs text-muted">{selectedFile}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-[10px] text-muted tracking-wide">Load for:</label>
                <input
                  value={editLoadFor}
                  onChange={(e) => setEditLoadFor(e.target.value)}
                  className="border border-border px-2 py-1 text-xs font-mono rounded w-64 focus:outline-none focus:border-accent"
                  placeholder="brand, logo, design"
                />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary text-xs py-1.5 px-4"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 p-6 font-mono text-sm leading-relaxed bg-bg resize-none focus:outline-none"
              placeholder="Write your judgment here..."
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted text-sm">Select a file to edit, or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
