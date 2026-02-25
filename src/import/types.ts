/**
 * Conversation Import Pipeline types (Prompt 14).
 * Handles parsing conversation exports, extracting methodology signals,
 * and generating draft Mindset files.
 */

export interface NormalizedMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export interface NormalizedConversation {
  id: string;
  title: string;
  messages: NormalizedMessage[];
  created_at?: string;
}

export type ImportSource = "claude" | "chatgpt" | "generic" | "text";

export type SignalType =
  | "correction"
  | "explanation"
  | "opinion"
  | "red_line"
  | "framework"
  | "preference";

export interface ExtractedSignal {
  type: SignalType;
  content: string;
  raw_quote: string;
  conversation_id: string;
  message_index: number;
  suggested_domain: string;
  suggested_topic: string;
  suggested_load_for: string[];
  confidence: number;
}

export interface ImportJob {
  id: string;
  creator_id: string;
  status: "pending" | "processing" | "review" | "complete" | "failed";
  source: ImportSource;
  file_name: string;
  file_size_bytes: number;
  total_conversations: number;
  total_messages: number;
  signals_found: number;
  draft_files_created: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ImportSignal {
  id: string;
  job_id: string;
  creator_id: string;
  signal_type: SignalType;
  content: string;
  raw_quote: string;
  source_conversation_id: string;
  source_message_index: number;
  context: string;
  suggested_file: string;
  suggested_load_for: string;
  confidence: number;
  status: "pending" | "approved" | "rejected" | "edited" | "blocked_pii";
  edited_content: string | null;
  merged_into: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface ImportDraftFile {
  id: string;
  job_id: string;
  creator_id: string;
  filepath: string;
  load_for: string;
  content: string;
  signal_ids: string; // JSON array
  status: "draft" | "approved" | "rejected";
  approved_at: string | null;
}

export interface ExtractionBatch {
  conversations: NormalizedConversation[];
  job_id: string;
  creator_id: string;
}
