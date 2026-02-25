"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";

interface FileNode {
  path: string;
  type: "md" | "jsonl";
  triggers?: string;
  size?: number;
  modified?: string;
}

interface FileTree {
  files: FileNode[];
}

export default function FilesPage() {
  const { data, loading, refetch } = useApi<FileTree>("/api/files/tree");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadFile(filePath: string) {
    try {
      const res = await apiFetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
      setContent(res.content);
      setSelectedFile(filePath);
      setEditing(false);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function saveFile() {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await apiFetch("/api/files/save", {
        method: "POST",
        body: { path: selectedFile, content },
      });
      setEditing(false);
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Group files by directory
  const groups: Record<string, FileNode[]> = {};
  for (const file of data?.files || []) {
    const dir = file.path.includes("/")
      ? file.path.split("/").slice(0, -1).join("/")
      : ".";
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(file);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Files</h1>
        <span className="text-sm text-muted">
          {data?.files?.length || 0} files
        </span>
      </div>

      <div className="flex gap-6">
        {/* File tree */}
        <div className="w-64 shrink-0">
          {loading ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groups)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dir, files]) => (
                  <div key={dir}>
                    <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">
                      {dir}
                    </p>
                    <div className="space-y-0.5">
                      {files.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => loadFile(file.path)}
                          className={`block w-full text-left text-sm px-2 py-1 rounded truncate transition-colors ${
                            selectedFile === file.path
                              ? "bg-accent-light text-accent"
                              : "text-text hover:bg-bg2"
                          }`}
                        >
                          {file.path.split("/").pop()}
                          <span className="text-xs text-muted ml-1">
                            .{file.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Content pane */}
        <div className="flex-1 card">
          {selectedFile ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-mono text-sm text-muted">{selectedFile}</h2>
                <div className="flex gap-2">
                  {editing ? (
                    <>
                      <button
                        onClick={() => setEditing(false)}
                        className="btn-secondary text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveFile}
                        disabled={saving}
                        className="btn-primary text-xs"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="btn-secondary text-xs"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {editing ? (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-[60vh] input font-mono text-xs resize-none"
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm font-mono text-text leading-relaxed">
                  {content}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted text-center py-20">
              Select a file to view its contents
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
