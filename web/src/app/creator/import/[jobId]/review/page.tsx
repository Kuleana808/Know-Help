"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Signal {
  id: string;
  signal_type: string;
  content: string;
  raw_quote: string;
  confidence: number;
  status: string;
  suggested_file: string;
  suggested_load_for: string;
  edited_content: string | null;
}

interface DraftFile {
  id: string;
  filepath: string;
  load_for: string;
  content: string;
  status: string;
  signal_ids: string;
}

interface JobStatus {
  id: string;
  status: string;
  signals_found: number;
  draft_files_created: number;
}

export default function ReviewPage() {
  const params = useParams();
  const jobId = params.jobId as string;

  const [signals, setSignals] = useState<Signal[]>([]);
  const [drafts, setDrafts] = useState<DraftFile[]>([]);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [activeTab, setActiveTab] = useState<"signals" | "drafts">("signals");
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<DraftFile | null>(null);
  const [editContent, setEditContent] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    loadData();
  }, [jobId]);

  async function loadData() {
    try {
      const [jobData, sigData, draftData] = await Promise.all([
        apiFetch<JobStatus>(`/api/import/${jobId}/status`),
        apiFetch<{ signals: Signal[] }>(`/api/import/${jobId}/signals?limit=100`),
        apiFetch<{ drafts: DraftFile[] }>(`/api/import/${jobId}/drafts`),
      ]);
      setJob(jobData);
      setSignals(sigData.signals || []);
      setDrafts(draftData.drafts || []);
    } catch (err: any) {
      alert("Failed to load: " + err.message);
    }
  }

  async function updateSignal(signalId: string, update: Record<string, unknown>) {
    await apiFetch(`/api/import/signals/${signalId}`, {
      method: "PATCH",
      body: update,
    });
    await loadData();
  }

  async function updateDraft(draftId: string, update: Record<string, unknown>) {
    await apiFetch(`/api/import/drafts/${draftId}`, {
      method: "PATCH",
      body: update,
    });
    await loadData();
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      // For now, prompt for mindset_id — in production this would be a selector
      const mindsetId = prompt("Enter your Mindset ID to publish to:");
      if (!mindsetId) return;

      const result = await apiFetch(`/api/import/${jobId}/publish`, {
        method: "POST",
        body: { mindset_id: mindsetId },
      });
      alert(`Published! ${result.files_created} files created, version ${result.version}`);
      await loadData();
    } catch (err: any) {
      alert("Publish failed: " + err.message);
    } finally {
      setPublishing(false);
    }
  }

  const filteredSignals = filter === "all"
    ? signals
    : signals.filter((s) => s.signal_type === filter);

  const signalTypes = [...new Set(signals.map((s) => s.signal_type))];
  const approvedDrafts = drafts.filter((d) => d.status === "approved").length;

  const typeBadgeColor: Record<string, string> = {
    correction: "border-blue-300 text-blue-600",
    explanation: "border-green-300 text-green-600",
    opinion: "border-yellow-300 text-yellow-700",
    red_line: "border-red-300 text-red-600",
    framework: "border-purple-300 text-purple-600",
    preference: "border-orange-300 text-orange-600",
  };

  return (
    <div className="flex h-screen">
      {/* Left panel — signal/draft list */}
      <div className="w-80 border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border">
          <p className="font-serif text-base mb-1">Import Review</p>
          <p className="text-[10px] text-muted">
            {signals.length} signals · {drafts.length} drafts
          </p>

          <div className="flex mt-3 border border-border">
            <button
              onClick={() => setActiveTab("signals")}
              className={`flex-1 text-[10px] py-1.5 ${activeTab === "signals" ? "bg-accent-light text-accent" : "text-muted"}`}
            >
              Signals ({signals.length})
            </button>
            <button
              onClick={() => setActiveTab("drafts")}
              className={`flex-1 text-[10px] py-1.5 border-l border-border ${activeTab === "drafts" ? "bg-accent-light text-accent" : "text-muted"}`}
            >
              Drafts ({drafts.length})
            </button>
          </div>
        </div>

        {activeTab === "signals" && (
          <>
            <div className="p-2 border-b border-border flex flex-wrap gap-1">
              <button
                onClick={() => setFilter("all")}
                className={`text-[9px] px-2 py-0.5 border ${filter === "all" ? "border-accent text-accent" : "border-border text-muted"}`}
              >
                All
              </button>
              {signalTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`text-[9px] px-2 py-0.5 border ${filter === type ? "border-accent text-accent" : "border-border text-muted"}`}
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredSignals.map((signal) => (
                <button
                  key={signal.id}
                  onClick={() => { setSelectedSignal(signal); setSelectedDraft(null); setEditContent(signal.edited_content || signal.content); }}
                  className={`w-full text-left p-3 border-b border-border hover:bg-bg2 transition-colors ${
                    selectedSignal?.id === signal.id ? "bg-accent-light" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] px-1.5 py-0.5 border ${typeBadgeColor[signal.signal_type] || "border-border text-muted"}`}>
                      {signal.signal_type}
                    </span>
                    <span className="text-[9px] text-muted">{(signal.confidence * 100).toFixed(0)}%</span>
                    {signal.status !== "pending" && (
                      <span className={`text-[9px] ${signal.status === "approved" ? "text-accent" : signal.status === "rejected" ? "text-red-500" : "text-muted"}`}>
                        {signal.status}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text line-clamp-2 leading-[1.5]">
                    {signal.content.slice(0, 120)}...
                  </p>
                </button>
              ))}
            </div>
          </>
        )}

        {activeTab === "drafts" && (
          <div className="flex-1 overflow-y-auto">
            {drafts.map((draft) => (
              <button
                key={draft.id}
                onClick={() => { setSelectedDraft(draft); setSelectedSignal(null); setEditContent(draft.content); }}
                className={`w-full text-left p-3 border-b border-border hover:bg-bg2 transition-colors ${
                  selectedDraft?.id === draft.id ? "bg-accent-light" : ""
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-mono text-accent-mid">{draft.filepath}</span>
                  <span className={`text-[9px] ${draft.status === "approved" ? "text-accent" : "text-muted"}`}>
                    {draft.status}
                  </span>
                </div>
                <p className="text-[10px] text-muted">{draft.load_for}</p>
              </button>
            ))}
          </div>
        )}

        {/* Publish button */}
        <div className="p-3 border-t border-border">
          <button
            onClick={handlePublish}
            disabled={publishing || approvedDrafts === 0}
            className="btn-primary w-full text-xs"
          >
            {publishing ? "Publishing..." : `Publish ${approvedDrafts} approved drafts`}
          </button>
        </div>
      </div>

      {/* Right panel — detail/editor */}
      <div className="flex-1 flex flex-col">
        {selectedSignal && (
          <>
            <div className="px-6 py-3 border-b border-border bg-surface flex items-center justify-between">
              <div>
                <span className={`text-[10px] px-2 py-0.5 border mr-2 ${typeBadgeColor[selectedSignal.signal_type] || "border-border text-muted"}`}>
                  {selectedSignal.signal_type}
                </span>
                <span className="text-xs text-muted">
                  Confidence: {(selectedSignal.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateSignal(selectedSignal.id, { status: "approved" })}
                  className="btn-primary text-xs py-1 px-3"
                >
                  Approve
                </button>
                <button
                  onClick={() => updateSignal(selectedSignal.id, { status: "rejected" })}
                  className="btn-secondary text-xs py-1 px-3"
                >
                  Reject
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="font-serif text-lg mb-4">Signal content</h3>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[200px] p-4 border border-border font-mono text-sm leading-relaxed focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => updateSignal(selectedSignal.id, { edited_content: editContent, status: "edited" })}
                className="btn-secondary text-xs mt-3"
              >
                Save edit
              </button>

              {selectedSignal.raw_quote && (
                <div className="mt-6">
                  <h4 className="text-[10px] tracking-wide uppercase text-muted mb-2">Original quote</h4>
                  <p className="text-xs text-muted bg-bg2 p-4 leading-[1.7] border border-border">
                    {selectedSignal.raw_quote}
                  </p>
                </div>
              )}

              <div className="mt-4 text-[10px] text-muted">
                <span>Maps to: {selectedSignal.suggested_file}</span>
                <span className="ml-4">Triggers: {selectedSignal.suggested_load_for}</span>
              </div>
            </div>
          </>
        )}

        {selectedDraft && (
          <>
            <div className="px-6 py-3 border-b border-border bg-surface flex items-center justify-between">
              <span className="text-xs font-mono text-accent-mid">{selectedDraft.filepath}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    updateDraft(selectedDraft.id, { content: editContent, status: "approved" });
                  }}
                  className="btn-primary text-xs py-1 px-3"
                >
                  Approve & save
                </button>
                <button
                  onClick={() => updateDraft(selectedDraft.id, { status: "rejected" })}
                  className="btn-secondary text-xs py-1 px-3"
                >
                  Reject
                </button>
              </div>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 p-6 font-mono text-sm leading-relaxed bg-bg resize-none focus:outline-none"
            />
          </>
        )}

        {!selectedSignal && !selectedDraft && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted text-sm">Select a signal or draft to review.</p>
          </div>
        )}
      </div>
    </div>
  );
}
