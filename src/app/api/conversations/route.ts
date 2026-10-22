import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { parseConversationExport } from "@/lib/behaviour/conversations";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CONSENT_STATEMENT = "I choose to import these conversations. Only my own messages are kept; I can delete them at any time.";

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return typeof userId === "string" ? { supabase, userId } : null;
}

// Imports an AI-chat export after explicit consent. Assistant messages are discarded before anything is stored.
export async function POST(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form || form.get("consent") !== "yes") return NextResponse.json({ error: "Confirm that you choose to import these conversations." }, { status: 400 });
  const source = ["chatgpt", "claude", "gemini", "other"].includes(String(form.get("source"))) ? String(form.get("source")) : "other";
  const file = form.get("file");
  const pasted = String(form.get("text") ?? "");
  const raw = file instanceof File && file.size ? (file.size > 25 * 1024 * 1024 ? "" : await file.text()) : pasted;
  if (!raw.trim()) return NextResponse.json({ error: "Upload an export (up to 25 MB) or paste a conversation." }, { status: 400 });
  const { messages, conversations } = parseConversationExport(raw);
  if (!messages.length) return NextResponse.json({ error: "No messages from you were found in that export." }, { status: 422 });
  const title = String(form.get("title") ?? "").trim().slice(0, 200) || `${source === "other" ? "AI" : source} conversations`;
  const { error } = await auth.supabase.from("conversation_imports").insert({ user_id: auth.userId, source, title, consent_statement: CONSENT_STATEMENT, user_messages: messages, message_count: messages.length, conversation_count: conversations });
  if (error) return NextResponse.json({ error: "The import could not be saved." }, { status: 500 });
  return NextResponse.json({ ok: true, messages: messages.length, conversations }, { status: 201 });
}

// Deleting an import removes it permanently; later analyses no longer use it.
export async function DELETE(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Unknown import." }, { status: 400 });
  const { data, error } = await auth.supabase.from("conversation_imports").delete().eq("id", id).select("id");
  if (error || !data?.length) return NextResponse.json({ error: "Import not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
