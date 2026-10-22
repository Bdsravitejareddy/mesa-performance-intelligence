// Parses AI-chat exports and keeps only the member's own messages. Assistant replies are dropped on purpose.

export type UserMessage = { conversation: string; text: string; at: string | null };
const MAX_MESSAGES = 2000;
const MAX_CHARS = 4000;

function push(out: UserMessage[], conversation: string, text: unknown, at: unknown) {
  if (typeof text !== "string" || !text.trim() || out.length >= MAX_MESSAGES) return;
  out.push({ conversation: conversation.slice(0, 200) || "Conversation", text: text.trim().slice(0, MAX_CHARS), at: typeof at === "number" ? new Date(at * 1000).toISOString() : typeof at === "string" ? at : null });
}

export function parseConversationExport(raw: string): { messages: UserMessage[]; conversations: number } {
  const trimmed = raw.trim();
  let data: unknown;
  try { data = JSON.parse(trimmed); } catch { data = null; }
  const out: UserMessage[] = [];
  const titles = new Set<string>();
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { conversations?: unknown }).conversations) ? (data as { conversations: unknown[] }).conversations : null;
  if (list) {
    for (const item of list as Record<string, unknown>[]) {
      const title = String(item.title ?? item.name ?? "Conversation");
      titles.add(title);
      // ChatGPT export: mapping of nodes with message.author.role and content.parts.
      if (item.mapping && typeof item.mapping === "object") {
        for (const node of Object.values(item.mapping as Record<string, { message?: { author?: { role?: string }; content?: { parts?: unknown[] }; create_time?: number } }>)) {
          if (node.message?.author?.role === "user") push(out, title, (node.message.content?.parts ?? []).filter((part) => typeof part === "string").join("\n"), node.message.create_time);
        }
      }
      // Claude export: chat_messages with sender "human".
      if (Array.isArray(item.chat_messages)) for (const message of item.chat_messages as Record<string, unknown>[]) if (message.sender === "human") push(out, title, message.text, message.created_at);
      // Generic: messages with role "user".
      if (Array.isArray(item.messages)) for (const message of item.messages as Record<string, unknown>[]) if (message.role === "user" || message.author === "user") push(out, title, message.content ?? message.text, message.created_at ?? message.timestamp);
    }
    return { messages: out, conversations: titles.size };
  }
  // Plain text: lines starting with "User:" / "You:" / "Me:" are the member's turns.
  let current: string[] | null = null;
  for (const line of trimmed.split(/\r?\n/)) {
    const turn = line.match(/^\s*(user|you|me|human)\s*:\s*(.*)$/i);
    const other = /^\s*(assistant|ai|chatgpt|claude|gemini|bot)\s*:/i.test(line);
    if (turn) { if (current) push(out, "Pasted conversation", current.join("\n"), null); current = [turn[2]]; }
    else if (other) { if (current) push(out, "Pasted conversation", current.join("\n"), null); current = null; }
    else if (current) current.push(line);
  }
  if (current) push(out, "Pasted conversation", current.join("\n"), null);
  return { messages: out, conversations: out.length ? 1 : 0 };
}
