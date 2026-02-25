/**
 * Conversation export parser (Prompt 14).
 * Supports Claude.ai JSON, ChatGPT ZIP/JSON, generic JSON/JSONL, plain text.
 */

import { NormalizedConversation, NormalizedMessage, ImportSource } from "./types";

/**
 * Detect format from file content and name.
 */
export function detectFormat(fileName: string, content: string): ImportSource {
  const ext = fileName.toLowerCase().split(".").pop();

  if (ext === "txt") return "text";

  try {
    const parsed = JSON.parse(content);

    // Claude.ai format: { conversations: [...] }
    if (parsed.conversations && Array.isArray(parsed.conversations)) {
      const first = parsed.conversations[0];
      if (first?.messages && Array.isArray(first.messages)) {
        if (first.messages[0]?.role === "human" || first.messages[0]?.role === "assistant") {
          return "claude";
        }
      }
    }

    // ChatGPT format: array of objects with mapping field
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      if (first?.mapping && typeof first.mapping === "object") {
        return "chatgpt";
      }
    }

    return "generic";
  } catch {
    // If not valid JSON, try text
    return "text";
  }
}

/**
 * Parse Claude.ai export format.
 */
function parseClaude(content: string): NormalizedConversation[] {
  const data = JSON.parse(content);
  const convos: NormalizedConversation[] = [];

  for (const conv of data.conversations || []) {
    const messages: NormalizedMessage[] = [];
    for (const msg of conv.messages || []) {
      const role = msg.role === "human" ? "user" : msg.role === "assistant" ? "assistant" : "system";
      if (role === "system") continue;
      messages.push({
        role,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        timestamp: msg.created_at,
      });
    }
    convos.push({
      id: conv.id || conv.uuid || `conv-${convos.length}`,
      title: conv.name || conv.title || `Conversation ${convos.length + 1}`,
      messages,
      created_at: conv.created_at,
    });
  }

  return convos;
}

/**
 * Parse ChatGPT export format.
 */
function parseChatGPT(content: string): NormalizedConversation[] {
  const data = JSON.parse(content);
  const convos: NormalizedConversation[] = [];

  for (const conv of (Array.isArray(data) ? data : [data])) {
    const messages: NormalizedMessage[] = [];

    if (conv.mapping) {
      // Sort by create_time to get chronological order
      const sorted = Object.values(conv.mapping)
        .filter((m: any) => m.message?.content?.parts?.length > 0)
        .sort((a: any, b: any) => (a.message?.create_time || 0) - (b.message?.create_time || 0));

      for (const entry of sorted) {
        const msg = (entry as any).message;
        if (!msg) continue;
        const authorRole = msg.author?.role;
        if (authorRole === "system") continue;
        const role = authorRole === "user" ? "user" : "assistant";
        const text = msg.content?.parts?.join("\n") || "";
        if (!text.trim()) continue;
        messages.push({
          role,
          content: text,
          timestamp: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : undefined,
        });
      }
    }

    convos.push({
      id: conv.id || `conv-${convos.length}`,
      title: conv.title || `Conversation ${convos.length + 1}`,
      messages,
      created_at: conv.create_time ? new Date(conv.create_time * 1000).toISOString() : undefined,
    });
  }

  return convos;
}

/**
 * Parse generic JSON with auto-detection of message fields.
 */
function parseGeneric(content: string): NormalizedConversation[] {
  const data = JSON.parse(content);
  const items = Array.isArray(data) ? data : data.conversations || data.messages ? [data] : [];
  const convos: NormalizedConversation[] = [];

  for (const item of items) {
    const messages: NormalizedMessage[] = [];
    const msgArray = item.messages || item.turns || item.entries || [];

    for (const msg of msgArray) {
      // Try common field names for role
      const role = msg.role || msg.author || msg.sender || msg.type;
      const normalRole = typeof role === "string" && /user|human/i.test(role) ? "user" : "assistant";
      // Try common field names for content
      const text = msg.content || msg.text || msg.message || msg.body || "";
      if (!text.trim()) continue;
      messages.push({ role: normalRole, content: text });
    }

    convos.push({
      id: item.id || `conv-${convos.length}`,
      title: item.title || item.name || `Conversation ${convos.length + 1}`,
      messages,
    });
  }

  return convos;
}

/**
 * Parse plain text transcript with turn markers.
 */
function parseText(content: string): NormalizedConversation[] {
  const lines = content.split("\n");
  const messages: NormalizedMessage[] = [];
  let currentRole: "user" | "assistant" | null = null;
  let currentContent: string[] = [];

  const userMarkers = /^(You|Human|User|Me):\s*/i;
  const assistantMarkers = /^(Claude|Assistant|AI|ChatGPT|Bot):\s*/i;

  for (const line of lines) {
    if (userMarkers.test(line)) {
      if (currentRole && currentContent.length > 0) {
        messages.push({ role: currentRole, content: currentContent.join("\n").trim() });
      }
      currentRole = "user";
      currentContent = [line.replace(userMarkers, "")];
    } else if (assistantMarkers.test(line)) {
      if (currentRole && currentContent.length > 0) {
        messages.push({ role: currentRole, content: currentContent.join("\n").trim() });
      }
      currentRole = "assistant";
      currentContent = [line.replace(assistantMarkers, "")];
    } else if (currentRole) {
      currentContent.push(line);
    }
  }

  // Flush last message
  if (currentRole && currentContent.length > 0) {
    messages.push({ role: currentRole, content: currentContent.join("\n").trim() });
  }

  if (messages.length === 0) return [];

  return [{
    id: "text-transcript-1",
    title: "Imported transcript",
    messages,
  }];
}

/**
 * Parse conversation export and return normalized conversations.
 */
export function parseExport(
  fileName: string,
  content: string,
  source?: ImportSource
): { conversations: NormalizedConversation[]; source: ImportSource } {
  const detectedSource = source || detectFormat(fileName, content);

  let conversations: NormalizedConversation[];
  switch (detectedSource) {
    case "claude":
      conversations = parseClaude(content);
      break;
    case "chatgpt":
      conversations = parseChatGPT(content);
      break;
    case "text":
      conversations = parseText(content);
      break;
    default:
      conversations = parseGeneric(content);
  }

  // Filter: conversations shorter than 4 turns or low-word-count user messages
  conversations = conversations.filter((conv) => {
    if (conv.messages.length < 4) return false;
    const userMsgs = conv.messages.filter((m) => m.role === "user");
    if (userMsgs.length === 0) return false;
    const avgWords = userMsgs.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0) / userMsgs.length;
    return avgWords >= 20;
  });

  return { conversations, source: detectedSource };
}
