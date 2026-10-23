import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { extractPdfPages } from "@/lib/documents";
import { extractDocxPages } from "@/lib/office-documents";

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 10 * 1024 * 1024;

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? supabase : null;
}

// Adds context to a project: a given problem statement (file or pasted) or a write-up in the member's own words.
// Only the extracted text is kept; the file itself is not stored.
export async function POST(request: NextRequest) {
  const supabase = await member();
  if (!supabase) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const projectKey = String(form?.get("projectKey") ?? "").slice(0, 200);
  const kind = form?.get("kind") === "own_words" ? "own_words" : form?.get("kind") === "problem_statement" ? "problem_statement" : null;
  const title = String(form?.get("title") ?? "").trim().slice(0, 300);
  let body = String(form?.get("text") ?? "").trim();
  const file = form?.get("file");
  let fileName: string | null = null;
  if (!projectKey || !kind) return NextResponse.json({ error: "Choose a project and the kind of context." }, { status: 400 });
  if (file instanceof File && file.size) {
    if (kind === "own_words") return NextResponse.json({ error: "Write your own words in the text box; files are for problem statements you were given." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Files up to 10 MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    try {
      // The PDF reader empties the buffer it reads, so it gets a copy.
      const pages = name.endsWith(".pdf") ? await extractPdfPages(bytes.slice()) : name.endsWith(".docx") ? await extractDocxPages(bytes) : null;
      if (!pages) return NextResponse.json({ error: "Upload a PDF or Word (.docx) file." }, { status: 400 });
      body = [body, pages.map((page) => page.text).join("\n\n")].filter(Boolean).join("\n\n").replace(/\u0000/g, "");
      fileName = file.name.slice(0, 200);
    } catch { return NextResponse.json({ error: "The file could not be read." }, { status: 400 }); }
  }
  if (!body) return NextResponse.json({ error: "Add some text or a file." }, { status: 400 });
  const { error } = await supabase.from("project_contexts").insert({ project_key: projectKey, kind, title, body: body.slice(0, 60_000), file_name: fileName });
  return error ? NextResponse.json({ error: "The context could not be saved." }, { status: 500 }) : NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await member();
  if (!supabase) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Unknown item." }, { status: 400 });
  const { error } = await supabase.from("project_contexts").delete().eq("id", id);
  return error ? NextResponse.json({ error: "Could not delete." }, { status: 500 }) : NextResponse.json({ ok: true });
}
