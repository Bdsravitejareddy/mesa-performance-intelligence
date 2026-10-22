import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { extractPdfPages, extractPptxSlides } from "@/lib/documents";
import { extractDocxPages, extractXlsxSheets } from "@/lib/office-documents";
import { MAX_FILE_BYTES, MIME, cleanCapture, detectFormat, driveFileId, storedSourceId, submittedFileUrl, type FileFormat } from "@/lib/imports/nexus";

export const maxDuration = 120;
const limits = { maxPages: 500, maxTextCharacters: 1_000_000, timeoutMs: 45_000, maxZipEntries: 4_096, maxUncompressedBytes: 80 * 1024 * 1024, maxEntryBytes: 16 * 1024 * 1024, maxSlideBytes: 4 * 1024 * 1024 } as const;

type Body = { assignmentId?: unknown; capture?: unknown; links?: unknown; files?: unknown };
type Outcome = { name: string; status: "attached" | "duplicate" | "rejected"; note?: string };

async function extract(format: FileFormat, bytes: Uint8Array) {
  if (format === "pdf") return extractPdfPages(bytes, limits);
  if (format === "pptx") return (await extractPptxSlides(bytes, limits)).map((slide) => ({ pageNumber: slide.slideNumber, text: slide.text, hasVisuals: slide.hasVisuals }));
  return format === "docx" ? extractDocxPages(bytes) : extractXlsxSheets(bytes);
}

// Member-approved, read-only capture of one Nexus assignment page (see AGENTS.md): records the page's
// submission context and links, and fetches each submitted file from its short-lived signed URL.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const assignmentId = typeof body?.assignmentId === "string" && /^[0-9a-f-]{36}$/i.test(body.assignmentId) ? body.assignmentId : null;
  if (!assignmentId) return NextResponse.json({ error: "A Nexus assignment id is required." }, { status: 400 });

  const { data: assessment } = await supabase.from("assessments").select("id, title").eq("source_record_id", `mesa-lms:assignment:${assignmentId}`).maybeSingle();
  if (!assessment) return NextResponse.json({ error: "This assignment has not been imported by the LMS sync yet." }, { status: 404 });
  // Attach to the LMS sync's own submission row so later syncs keep one record per assessment.
  const { data: submission } = await supabase.from("submissions").select("id, user_id").eq("assessment_id", assessment.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!submission) return NextResponse.json({ error: "No submission record yet; run the LMS sync first." }, { status: 409 });

  const capture = cleanCapture(body?.capture);
  await supabase.from("submissions").update({ page_capture: capture }).eq("id", submission.id);

  const links = (Array.isArray(body?.links) ? body.links : []).filter((link): link is string => typeof link === "string").slice(0, 20);
  for (const url of links) {
    if (!/^https:\/\//.test(url) || url.length > 2000) continue;
    await supabase.from("submission_links").upsert({ user_id: submission.user_id, submission_id: submission.id, url, drive_file_id: driveFileId(url) }, { onConflict: "submission_id,url" });
  }

  const outcomes: Outcome[] = [];
  const files = (Array.isArray(body?.files) ? body.files : []).slice(0, 10) as { name?: unknown; url?: unknown }[];
  for (const file of files) {
    const name = typeof file.name === "string" && file.name.trim() ? file.name.trim().slice(0, 240) : "submission";
    const url = typeof file.url === "string" ? submittedFileUrl(file.url, assignmentId) : null;
    if (!url) { outcomes.push({ name, status: "rejected", note: "Not a Nexus submission file for this assignment." }); continue; }
    let objectPath: string | null = null;
    try {
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`The signed link returned HTTP ${response.status}; it may have expired — capture the page again.`);
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > MAX_FILE_BYTES) throw new Error("File is larger than 20 MiB.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new Error("File is empty or larger than 20 MiB.");
      const format = detectFormat(url.pathname, bytes) ?? detectFormat(name, bytes);
      if (!format) throw new Error("Only PDF, PowerPoint, Word and Excel files can be read.");
      const sourceVersion = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      const { data: existing } = await supabase.from("submission_documents").select("id").eq("submission_id", submission.id).eq("source_version", sourceVersion).maybeSingle();
      if (existing) { outcomes.push({ name, status: "duplicate" }); continue; }
      const pages = await extract(format, bytes);
      if (!pages.length) throw new Error("The file has no readable text.");
      objectPath = `${submission.user_id}/${submission.id}/${randomUUID()}/${name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-150) || "submission"}`;
      const { error: uploadError } = await supabase.storage.from("submission-files").upload(objectPath, bytes, { contentType: MIME[format], upsert: false });
      if (uploadError) throw new Error("The private copy could not be stored.");
      const { error } = await supabase.from("submission_documents").insert({
        user_id: submission.user_id,
        submission_id: submission.id,
        source_kind: "lms",
        source_id: storedSourceId(url),
        name,
        mime_type: MIME[format],
        file_size: bytes.byteLength,
        storage_path: objectPath,
        extracted_text: pages.map((page) => `[Page or slide ${page.pageNumber}]\n${page.text}`).join("\n\n").slice(0, 500_000),
        extraction_status: pages.some((page) => "hasVisuals" in page && page.hasVisuals) ? "needs_visual_review" : "complete",
        source_version: sourceVersion,
      });
      if (error) throw new Error("The file was read but could not be saved as evidence.");
      objectPath = null;
      outcomes.push({ name, status: "attached" });
    } catch (reason) {
      if (objectPath) await supabase.storage.from("submission-files").remove([objectPath]).catch(() => undefined);
      outcomes.push({ name, status: "rejected", note: reason instanceof Error ? reason.message.slice(0, 200) : "Could not import." });
    }
  }
  return NextResponse.json({ assessment: assessment.title, capture, links: links.length, files: outcomes });
}
