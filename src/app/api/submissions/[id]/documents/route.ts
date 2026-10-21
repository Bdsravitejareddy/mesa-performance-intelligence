import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { extractPdfPages, extractPptxSlides } from "@/lib/documents";
import { SUBMISSION_DOCUMENT_MIME_TYPES } from "@/lib/lms/submission-documents";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const maxFileSize = 20 * 1024 * 1024;
const pdfMime = SUBMISSION_DOCUMENT_MIME_TYPES[0];
const pptxMime = SUBMISSION_DOCUMENT_MIME_TYPES[1];

type SubmissionDocumentContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: SubmissionDocumentContext) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase before attaching submission evidence." }, { status: 503 });
  const { id: submissionId } = await context.params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (typeof claimsData?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in before attaching submission evidence." }, { status: 401 });

  const { data: submission } = await supabase.from("submissions").select("id, user_id, assessment_id").eq("id", submissionId).maybeSingle();
  if (!submission) return NextResponse.json({ error: "Submission was not found in this workspace." }, { status: 404 });
  const { data: assessment } = await supabase.from("assessments").select("id, course_id").eq("id", submission.assessment_id).maybeSingle();
  if (!assessment) return NextResponse.json({ error: "The submission assessment is unavailable." }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    const body = await request.json().catch(() => null) as { courseMaterialId?: string } | null;
    if (!body?.courseMaterialId) return NextResponse.json({ error: "Choose an indexed course material to link." }, { status: 400 });
    const { data: material } = await supabase.from("course_materials")
      .select("id, course_id, assessment_id, name, mime_type, file_size, version, extraction_status, drive_source_id")
      .eq("id", body.courseMaterialId).maybeSingle();
    if (!material) return NextResponse.json({ error: "Indexed course material was not found in this workspace." }, { status: 404 });
    if (material.course_id !== assessment.course_id || (material.assessment_id && material.assessment_id !== assessment.id)) {
      return NextResponse.json({ error: "The selected course material does not match this assessment." }, { status: 400 });
    }
    if (material.extraction_status !== "complete" && material.extraction_status !== "needs_visual_review") {
      return NextResponse.json({ error: "Only successfully indexed course materials can be linked." }, { status: 400 });
    }
    const { data: pages, error: pageError } = await supabase.from("material_pages").select("page_number, extracted_text").eq("material_id", material.id).order("page_number", { ascending: true });
    if (pageError || !pages?.length) return NextResponse.json({ error: "The selected material has no indexed text to attach." }, { status: 400 });
    const extractedText = pages.map((page) => `[Page or slide ${page.page_number}]\n${page.extracted_text}`).join("\n\n").slice(0, 500_000);
    const sourceId = material.drive_source_id ?? material.id;
    const { data, error } = await supabase.from("submission_documents").insert({
      user_id: submission.user_id,
      submission_id: submission.id,
      source_kind: material.drive_source_id ? "drive" : "lms",
      source_id: sourceId,
      course_material_id: material.id,
      name: material.name,
      mime_type: material.mime_type,
      file_size: material.file_size,
      extracted_text: extractedText,
      extraction_status: material.extraction_status,
      source_version: String(material.version),
    }).select("id").single();
    if (error || !data) return NextResponse.json({ error: "Could not link the indexed course material." }, { status: 400 });
    return NextResponse.json({ id: data.id, name: material.name, extractionStatus: material.extraction_status }, { status: 201 });
  }

  let objectPath: string | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (!(entry instanceof File)) return NextResponse.json({ error: "Choose a PDF or PPTX file." }, { status: 400 });
    if (entry.size <= 0 || entry.size > maxFileSize) return NextResponse.json({ error: "Submission files must be between 1 byte and 20 MiB." }, { status: 413 });
    const filename = entry.name.trim().slice(0, 240);
    const extension = filename.split(".").at(-1)?.toLowerCase();
    const mimeType = extension === "pdf" ? pdfMime : extension === "pptx" ? pptxMime : "";
    if (!mimeType || entry.type !== mimeType) return NextResponse.json({ error: "Upload a PDF or PPTX with a matching file type." }, { status: 415 });
    const bytes = new Uint8Array(await entry.arrayBuffer());
    if (bytes.byteLength !== entry.size || bytes.byteLength > maxFileSize) return NextResponse.json({ error: "Submission file size could not be verified." }, { status: 413 });
    const signature = new TextDecoder().decode(bytes.subarray(0, mimeType === pdfMime ? 5 : 4));
    if ((mimeType === pdfMime && signature !== "%PDF-") || (mimeType === pptxMime && signature !== "PK\u0003\u0004")) {
      return NextResponse.json({ error: "The file content does not match its PDF or PPTX type." }, { status: 415 });
    }
    const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-150) || "submission";
    objectPath = `${submission.user_id}/${submission.id}/${randomUUID()}/${safeName}`;
    const { error: uploadError } = await supabase.storage.from("submission-files").upload(objectPath, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) throw new Error("Private submission file upload failed.");
    const pages = mimeType === pdfMime
      ? await extractPdfPages(bytes)
      : (await extractPptxSlides(bytes)).map((slide) => ({ pageNumber: slide.slideNumber, text: slide.text, hasVisuals: slide.hasVisuals }));
    if (!pages.length) throw new Error("The file contains no readable pages or slides.");
    const extractedText = pages.map((page) => `[Page or slide ${page.pageNumber}]\n${page.text}`).join("\n\n").slice(0, 500_000);
    const extractionStatus = pages.some((page) => page.hasVisuals) ? "needs_visual_review" : "complete";
    const sourceVersion = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const { data, error } = await supabase.from("submission_documents").insert({
      user_id: submission.user_id,
      submission_id: submission.id,
      source_kind: "upload",
      name: filename,
      mime_type: mimeType,
      file_size: bytes.byteLength,
      storage_path: objectPath,
      extracted_text: extractedText,
      extraction_status: extractionStatus,
      source_version: sourceVersion,
    }).select("id").single();
    if (error || !data) throw new Error("The file was extracted but could not be saved as submission evidence.");
    return NextResponse.json({ id: data.id, name: filename, extractionStatus }, { status: 201 });
  } catch (reason) {
    if (objectPath) {
      try { await supabase.storage.from("submission-files").remove([objectPath]); } catch { /* Keep the processing error safe for display; storage remains private. */ }
    }
    const message = reason instanceof Error ? reason.message : "Submission evidence could not be processed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

export async function DELETE(request: NextRequest, context: SubmissionDocumentContext) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase before removing submission evidence." }, { status: 503 });
  const { id: submissionId } = await context.params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (typeof claimsData?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in before removing submission evidence." }, { status: 401 });
  const { data: submission } = await supabase.from("submissions").select("id").eq("id", submissionId).maybeSingle();
  if (!submission) return NextResponse.json({ error: "Submission was not found in this workspace." }, { status: 404 });
  const body = await request.json().catch(() => null) as { documentId?: string } | null;
  if (!body?.documentId) return NextResponse.json({ error: "Choose submission evidence to remove." }, { status: 400 });
  const { data: document } = await supabase.from("submission_documents").select("id, storage_path").eq("id", body.documentId).eq("submission_id", submissionId).maybeSingle();
  if (!document) return NextResponse.json({ error: "Submission evidence was not found." }, { status: 404 });
  if (document.storage_path) {
    const { error } = await supabase.storage.from("submission-files").remove([document.storage_path]);
    if (error) return NextResponse.json({ error: "The private file could not be removed; evidence record was kept." }, { status: 503 });
  }
  const { error } = await supabase.from("submission_documents").delete().eq("id", document.id).eq("submission_id", submissionId);
  if (error) return NextResponse.json({ error: "Could not remove submission evidence." }, { status: 400 });
  return NextResponse.json({ removed: true });
}
