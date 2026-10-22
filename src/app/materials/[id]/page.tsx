import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DescribeMaterialsButton, MaterialReviewActions, PageNoteEditor } from "@/components/material-review";
import { visionAvailable } from "@/lib/ai/gemini-vision";
import { safeDriveSourceUrl } from "@/lib/drive-sync/source-url";
import { summarizeMaterialPages, type ReviewPage } from "@/lib/materials/review";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MaterialReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: material } = await supabase.from("course_materials").select("id, name, version, course_id, extraction_status, drive_source_id").eq("id", id).maybeSingle();
  if (!material) notFound();
  const [pages, notes, review, source] = await Promise.all([
    supabase.from("material_pages").select("page_number, extracted_text, table_data, has_visuals").eq("material_id", id).order("page_number"),
    supabase.from("material_page_notes").select("page_number, note, author_kind, provider_model, colour_meaning, decorative, updated_at").eq("material_id", id),
    supabase.from("material_reviews").select("outcome, note, reviewed_at").eq("material_id", id).maybeSingle(),
    material.drive_source_id ? supabase.from("drive_sources").select("drive_file_id, metadata").eq("id", material.drive_source_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (pages.error || notes.error) throw new Error("Could not load this material for review.");
  const summary = summarizeMaterialPages((pages.data ?? []) as ReviewPage[]);
  const noteBy = new Map((notes.data ?? []).filter((row) => row.author_kind === "member").map((row) => [row.page_number as number, row.note as string]));
  const aiBy = new Map((notes.data ?? []).filter((row) => row.author_kind === "ai_vision").map((row) => [row.page_number as number, row]));
  const vision = visionAvailable();
  const undescribed = summary.attention.filter((item) => !aiBy.has(item.pageNumber)).length;
  const metadata = (source.data?.metadata ?? {}) as { sourceUrl?: string };
  const driveUrl = source.data?.drive_file_id && metadata.sourceUrl ? safeDriveSourceUrl(source.data.drive_file_id, metadata.sourceUrl) : null;
  return <AppShell demoMode={false}><div className="section-page">
    <Link className="back-link" href="/materials/review"><ArrowLeft size={14} /> Material review</Link>
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> v{material.version} · {material.extraction_status.replaceAll("_", " ")}</div><h1>{material.name}</h1><p className="page-subtitle">{summary.pages} slides · {summary.withText} with text · {summary.noText} without text · {summary.attention.length} to look at</p></div>{driveUrl && <a className="button button-secondary" href={driveUrl} target="_blank" rel="noreferrer" referrerPolicy="no-referrer">Open original in Drive</a>}</div>
    {undescribed > 0 && <DescribeMaterialsButton materialId={id} available={vision.ok} reason={vision.ok ? "" : vision.reason} />}
    <MaterialReviewActions materialId={id} current={review.data ? { outcome: review.data.outcome as string, note: review.data.note as string } : null} attentionCount={summary.attention.length} notesCount={noteBy.size} />
    <section className="content-panel"><h2>Slides to look at <span className="panel-count">{summary.attention.length}</span></h2>
      <p className="empty-hint">AI descriptions are generated from the slide images, chart data and diagram labels in the original file. They are labelled as AI-generated wherever they are used. Add a note only if a description is wrong or missing.</p>
      {summary.attention.length ? <div className="review-pages">{summary.attention.map((item) => <article className="review-page" key={item.pageNumber}>
        <header><strong>Slide {item.pageNumber}</strong><small>{item.reason === "no_text" ? "No readable text" : "Mostly image"}</small></header>
        {item.textPreview && <p className="review-text">Extracted text: “{item.textPreview}”</p>}
        {aiBy.get(item.pageNumber) ? <div className="ai-description"><small>AI description · {String(aiBy.get(item.pageNumber)!.provider_model)}{aiBy.get(item.pageNumber)!.decorative ? " · decorative" : ""}</small><p>{String(aiBy.get(item.pageNumber)!.note)}</p>{aiBy.get(item.pageNumber)!.colour_meaning && <p className="ai-colour">Colour coding: {String(aiBy.get(item.pageNumber)!.colour_meaning)}</p>}</div> : <p className="review-text">Not described yet.</p>}
        <PageNoteEditor materialId={id} pageNumber={item.pageNumber} initial={noteBy.get(item.pageNumber) ?? ""} />
      </article>)}</div> : <p className="empty-hint">Every slide has readable text. Images here are likely decoration; you can mark this document as not needing notes.</p>}
    </section>
  </div></AppShell>;
}
