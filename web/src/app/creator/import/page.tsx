"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

interface ImportJob {
  id: string;
  status: string;
  source: string;
  file_name: string;
  total_conversations: number;
  total_messages: number;
  signals_found: number;
  draft_files_created: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export default function ImportPage() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentJob, setCurrentJob] = useState<ImportJob | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load existing jobs on first render
  if (!loaded) {
    apiFetch<{ jobs: ImportJob[] }>("/api/import")
      .then((data) => setJobs(data.jobs || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const text = await file.text();
      const content = btoa(unescape(encodeURIComponent(text)));

      const result = await apiFetch<{ job_id: string; source: string }>("/api/import/upload", {
        method: "POST",
        body: { content, fileName: file.name },
      });

      // Poll for status
      const jobId = result.job_id;
      const poll = setInterval(async () => {
        try {
          const status = await apiFetch<ImportJob>(`/api/import/${jobId}/status`);
          setCurrentJob(status);
          if (status.status === "review" || status.status === "complete" || status.status === "failed") {
            clearInterval(poll);
            setJobs((prev) => [status, ...prev.filter((j) => j.id !== status.id)]);
          }
        } catch {
          clearInterval(poll);
        }
      }, 2000);

      setCurrentJob({ id: jobId, status: "processing", source: result.source } as ImportJob);
    } catch (err: any) {
      alert(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  return (
    <div className="p-12 max-w-3xl">
      <p className="text-[10px] tracking-[0.22em] uppercase text-accent-mid mb-6">
        Conversation Import
      </p>
      <h1 className="font-serif text-3xl mb-3">Import Your Methodology</h1>
      <p className="text-sm text-muted leading-[1.85] mb-10">
        Upload your conversation history from Claude.ai, ChatGPT, or any AI tool.
        We&apos;ll extract your methodology, corrections, and judgment signals —
        then generate draft Mindset files for your review.
      </p>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed p-12 text-center transition-colors mb-10 ${
          dragActive ? "border-accent bg-accent-light" : "border-border hover:border-border-dark"
        }`}
      >
        <p className="text-muted text-sm mb-3">
          {uploading ? "Processing..." : "Drop your export file here"}
        </p>
        <p className="text-[11px] text-border-dark mb-4">
          Accepts .json, .zip, .txt, .jsonl — up to 50MB
        </p>
        <label className="btn-primary text-xs cursor-pointer inline-block">
          Choose file
          <input
            type="file"
            accept=".json,.zip,.txt,.jsonl"
            onChange={onFileSelect}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {/* Export instructions */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="card p-5">
          <h3 className="font-serif text-sm mb-2">Claude.ai</h3>
          <p className="text-[11px] text-muted leading-[1.7]">
            Go to claude.ai → Settings → Account → Export data.
            Upload the conversations.json file.
          </p>
        </div>
        <div className="card p-5">
          <h3 className="font-serif text-sm mb-2">ChatGPT</h3>
          <p className="text-[11px] text-muted leading-[1.7]">
            Go to chat.openai.com → Settings → Data controls → Export data.
            Upload the ZIP or conversations.json.
          </p>
        </div>
      </div>

      {/* Current job status */}
      {currentJob && (
        <div className="card p-6 mb-8">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-serif text-base">
              {currentJob.status === "processing" ? "Processing..." :
               currentJob.status === "review" ? "Ready for review" :
               currentJob.status === "failed" ? "Failed" : currentJob.status}
            </h3>
            <span className={`text-[10px] tracking-wide uppercase px-2 py-0.5 border ${
              currentJob.status === "review" ? "border-accent text-accent" :
              currentJob.status === "failed" ? "border-red-400 text-red-500" :
              "border-border text-muted"
            }`}>
              {currentJob.status}
            </span>
          </div>
          {currentJob.source && (
            <p className="text-xs text-muted mb-1">Source: {currentJob.source}</p>
          )}
          <div className="grid grid-cols-4 gap-4 text-center mt-4">
            <div>
              <div className="text-xl font-serif">{currentJob.total_conversations || "—"}</div>
              <div className="text-[10px] text-muted">Conversations</div>
            </div>
            <div>
              <div className="text-xl font-serif">{currentJob.total_messages || "—"}</div>
              <div className="text-[10px] text-muted">Messages</div>
            </div>
            <div>
              <div className="text-xl font-serif">{currentJob.signals_found || "—"}</div>
              <div className="text-[10px] text-muted">Signals</div>
            </div>
            <div>
              <div className="text-xl font-serif">{currentJob.draft_files_created || "—"}</div>
              <div className="text-[10px] text-muted">Draft files</div>
            </div>
          </div>
          {currentJob.status === "review" && (
            <a
              href={`/creator/import/${currentJob.id}/review`}
              className="btn-primary text-xs mt-4 inline-block"
            >
              Review signals & drafts
            </a>
          )}
          {currentJob.error && (
            <p className="text-xs text-red-500 mt-3">{currentJob.error}</p>
          )}
        </div>
      )}

      {/* Previous jobs */}
      {jobs.length > 0 && (
        <div>
          <h3 className="font-serif text-lg mb-4">Previous imports</h3>
          <div className="space-y-2">
            {jobs.map((job) => (
              <div key={job.id} className="card p-4 flex justify-between items-center">
                <div>
                  <span className="text-xs">{job.file_name || "Import"}</span>
                  <span className="text-[10px] text-muted ml-3">
                    {job.signals_found} signals · {job.draft_files_created} drafts
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] tracking-wide uppercase ${
                    job.status === "review" ? "text-accent" :
                    job.status === "complete" ? "text-muted" :
                    job.status === "failed" ? "text-red-500" : "text-muted"
                  }`}>
                    {job.status}
                  </span>
                  {job.status === "review" && (
                    <a
                      href={`/creator/import/${job.id}/review`}
                      className="text-xs text-accent-mid"
                    >
                      Review →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
