import { NextResponse, type NextRequest } from "next/server";
import { extractPdfPages, extractPptxSlides } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const maxFileSize = 20 * 1024 * 1024;
const supportedExtensions = new Set(["pdf", "pptx"]);

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase before indexing course materials." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as {
    courseId?: string;
    assessmentId?: string;
    storagePath?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    sourceKind?: string;
    visualNotes?: string;
  } | null;
  if (!body?.courseId || !body.storagePath || !body.fileName || !body.fileSize) return NextResponse.json({ error: "Upload metadata is incomplete." }, { status: 400 });
  if (body.fileSize > maxFileSize || body.fileSize <= 0) return NextResponse.json({ error: "Course files must be between 1 byte and 20 MB." }, { status: 413 });
  const extension = body.fileName.split(".").at(-1)?.toLowerCase() ?? "";
  if (!supportedExtensions.has(extension)) return NextResponse.json({ error: "Upload PDF or PPTX materials for this MVP." }, { status: 415 });

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in before indexing course materials." }, { status: 401 });
  if (!body.storagePath.startsWith(`${userId}/${body.courseId}/`)) return NextResponse.json({ error: "The uploaded file is outside the signed-in user's workspace." }, { status: 403 });
  const { data: course } = await supabase.from("courses").select("id, user_id").eq("id", body.courseId).maybeSingle();
  if (!course) return NextResponse.json({ error: "Course was not found in this workspace." }, { status: 404 });
  if (body.assessmentId) {
    const { data: linkedAssessment } = await supabase.from("assessments").select("id").eq("id", body.assessmentId).eq("course_id", body.courseId).maybeSingle();
    if (!linkedAssessment) return NextResponse.json({ error: "The selected assessment does not belong to this course." }, { status: 400 });
  }

  const { data: file, error: downloadError } = await supabase.storage.from("course-files").download(body.storagePath);
  if (downloadError || !file) return NextResponse.json({ error: "Could not read the private uploaded file." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > maxFileSize) return NextResponse.json({ error: "Course files must not exceed 20 MB." }, { status: 413 });

  try {
    const pages = extension === "pdf"
      ? await extractPdfPages(bytes)
      : (await extractPptxSlides(bytes)).map((slide) => ({
          pageNumber: slide.slideNumber,
          text: slide.text,
          tables: slide.tables,
          hasVisuals: slide.hasVisuals,
        }));
    const sourceKind = isSourceKind(body.sourceKind) ? body.sourceKind : "course_upload";
    const visualNotes = body.visualNotes?.trim().slice(0, 4000) ?? "";
    const status = pages.some((page) => page.hasVisuals) && !visualNotes ? "needs_visual_review" : "complete";

    const { data: material, error: materialError } = await supabase.from("course_materials").insert({
      user_id: course.user_id,
      course_id: body.courseId,
      assessment_id: body.assessmentId || null,
      name: body.fileName.slice(0, 240),
      storage_path: body.storagePath,
      mime_type: body.mimeType?.slice(0, 120) || (extension === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
      file_size: bytes.byteLength,
      source_kind: sourceKind,
      extraction_status: status,
    }).select("id").single();
    if (materialError || !material) throw new Error("The file was parsed, but material metadata could not be saved.");

    const pageRecords = pages.map((page) => ({
      user_id: course.user_id,
      material_id: material.id,
      page_number: page.pageNumber,
      extracted_text: page.text,
      table_data: page.tables,
      has_visuals: page.hasVisuals,
      visual_notes: page.hasVisuals ? visualNotes : "",
    }));
    if (pageRecords.length) {
      const { error: pagesError } = await supabase.from("material_pages").insert(pageRecords);
      if (pagesError) {
        await supabase.from("course_materials").delete().eq("id", material.id);
        throw new Error("The file was parsed, but its indexed pages could not be saved.");
      }
    }

    return NextResponse.json({ id: material.id, pageCount: pages.length, status }, { status: 201 });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "The file could not be parsed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

function isSourceKind(value?: string): value is "syllabus" | "slides" | "notes" | "case_study" | "assignment" | "rubric" | "reading" | "sample_answer" | "faculty_example" | "assessment_paper" | "answer_key" | "course_upload" {
  return ["syllabus", "slides", "notes", "case_study", "assignment", "rubric", "reading", "sample_answer", "faculty_example", "assessment_paper", "answer_key", "course_upload"].includes(value ?? "");
}
