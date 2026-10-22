import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MaterialReviewActions, PageNoteEditor } from "@/components/material-review";
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
    supabase.from("material_page_notes").select("page_number, note, updated_at").eq("material_id", id),
    supabase.from("material_reviews").select("outcome, note, reviewed_at").eq("material_id", id).maybeSingle(),
    material.drive_source_id ? supabase.from("drive_sources").select("drive_file_id, metadata").eq("id", material.drive_source_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (pages.error || notes.error) throw new Error("Could not load this material for review.");
  const summary = summarizeMaterialPages((pages.data ?? []) as ReviewPage[]);
  const noteBy = new Map((notes.data ?? []).map((row) => [row.page_number as number, row.note as string]));
  const metadata = (source.data?.metadata ?? {}) as { sourceUrl?: string };
  const driveUrl = source.data?.drive_file_id && metadata.sourceUrl ? safeDriveSourceUrl(source.data.drive_file_id, metadata.sourceUrl) : null;
  return <AppShell demoMode={false}><div className="section-page">
    <Link className="back-link" href="/materials/review"><ArrowLeft size={14} /> Material review</Link>
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> v{material.version} · {material.extraction_status.replaceAll("_", " ")}</div><h1>{material.name}</h1><p className="page-subtitle">{summary.pages} slides · {summary.withText} with text · {summary.noText} without text · {summary.attention.length} to look at</p></div>{driveUrl && <a className="button button-secondary" href={driveUrl} target="_blank" rel="noreferrer" referrerPolicy="no-referrer">Open original in Drive</a>}</div>
    <MaterialReviewActions materialId={id} current={review.data ? { outcome: review.data.outcome as string, note: review.data.note as string } : null} attentionCount={summary.attention.length} notesCount={noteBy.size} />
    <section className="content-panel"><h2>Slides to look at <span className="panel-count">{summary.attention.length}</span></h2>
      <p className="empty-hint">Open the original, look at each slide below and describe what the image, chart or diagram shows in a sentence or two. Leave a slide blank if it is only decoration.</p>
      {summary.attention.length ? <div className="review-pages">{summary.attention.map((item) => <article className="review-page" key={item.pageNumber}>
        <header><strong>Slide {item.pageNumber}</strong><small>{item.reason === "no_text" ? "No readable text" : "Mostly image"}</small></header>
        {item.textPreview && <p className="review-text">Extracted text: “{item.textPreview}”</p>}
        <PageNoteEditor materialId={id} pageNumber={item.pageNumber} initial={noteBy.get(item.pageNumber) ?? ""} />
      </article>)}</div> : <p className="empty-hint">Every slide has readable text. Images here are likely decoration; you can mark this document as not needing notes.</p>}
    </section>
  </div></AppShell>;
}
