import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { summarizeMaterialPages, type ReviewPage } from "@/lib/materials/review";
import { DescribeMaterialsButton } from "@/components/material-review";
import { visionAvailable } from "@/lib/ai/gemini-vision";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MaterialReviewListPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const rows = demoMode || !hasSupabaseConfig() ? [] : await loadQueue();
  // Slides drawn only with vector graphics or shapes have nothing more to read automatically once the rest are described.
  const covered = (row: (typeof rows)[number]) => row.summary.attention.every((item) => row.describedPages.has(item.pageNumber)) || Boolean(row.lastRun?.message.includes("vector graphics"));
  const open = rows.filter((row) => !row.review && row.summary.attention.length > 0 && !covered(row));
  const nothing = rows.filter((row) => !row.review && row.summary.attention.length === 0);
  const done = rows.filter((row) => row.review || (row.summary.attention.length > 0 && covered(row)));
  const vision = visionAvailable();
  const scanned = open.filter((row) => row.summary.pages > 0 && row.summary.noText === row.summary.pages);
  const blind = open.reduce((sum, row) => sum + row.summary.noText, 0);
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Course materials</div><h1>Material review</h1><p className="page-subtitle">Slides the importer could not read on its own. Your notes fill the gap without changing the imported document.</p></div></div>
    <div className="info-callout"><span>A document is flagged when any slide has an image or no text, so most flags are harmless logos. Only slides with <strong>no readable text</strong> or <strong>mostly image</strong> are listed for review. Notes are labelled as member interpretation wherever they are used.</span></div>
    <section className="competency-summary" aria-label="Review progress">
      <div className="competency-summary-item"><strong>{open.length}</strong><span>Documents with slides still to describe</span></div>
      <div className="competency-summary-item"><strong>{nothing.length}</strong><span>Flagged only for decoration</span></div>
      <div className="competency-summary-item"><strong>{blind}</strong><span>Slides with no readable text</span></div>
      <div className="competency-summary-item"><strong>{done.length}</strong><span>Described or reviewed</span></div>
    </section>
    {open.length > 0 && <DescribeMaterialsButton available={vision.ok} reason={vision.ok ? "" : vision.reason} />}
    {scanned.length > 0 && <div className="info-callout data-quality-warning"><span><strong>{scanned.length === 1 ? "1 document has" : `${scanned.length} documents have`} no readable text on any page</strong> ({scanned.map((row) => row.name).join(", ")}). These are probably scanned images. Notes per page work, but a text-based PDF from Drive would be far more useful; OCR is not available yet.</span></div>}
    {[["Slides still to describe", open], ["Described by AI or reviewed", done], ["Flagged only for decoration — nothing to add", nothing]].map(([label, list]) => (list as typeof rows).length > 0 && <section className="content-panel" key={label as string}><h2>{label as string} <span className="panel-count">{(list as typeof rows).length}</span></h2>
      <div className="review-list">{(list as typeof rows).map((row) => <Link href={`/materials/${row.id}`} className="review-row" key={row.id}>
        <span><strong>{row.name}</strong><small>{row.course}</small></span>
        <span className="review-stats"><small>{row.summary.pages} slides · {row.summary.noText} without text · {row.summary.attention.length - row.summary.noText} mostly image</small><small>{row.aiNotes ? `${row.aiNotes} described by AI` : "Not described yet"}{row.notes ? ` · ${row.notes} member note${row.notes > 1 ? "s" : ""}` : ""}{row.review ? ` · ${row.review === "reviewed" ? "Reviewed" : "Marked not needed"}` : ""}</small>{row.lastRun && row.lastRun.message.includes("vector graphics") && <small>Some slides use vector graphics or shapes only; their text is already indexed.</small>}{row.lastRun && row.lastRun.status === "failed" && <small className="review-run-issue">Last attempt {row.lastRun.status}: {row.lastRun.message}</small>}</span>
      </Link>)}</div>
    </section>)}
    {!rows.length && <section className="content-panel"><p className="empty-hint">{demoMode ? "Preview mode has no imported materials." : "No imported materials are flagged for review."}</p></section>}
  </div></AppShell>;
}

async function loadQueue() {
  const supabase = await createClient();
  const { data: current, error } = await supabase.from("current_course_materials").select("id");
  if (error) throw new Error("Could not load materials.");
  const ids = (current ?? []).map((row) => row.id as string);
  if (!ids.length) return [];
  const [materials, links, courses, reviews, notes, runs] = await Promise.all([
    supabase.from("course_materials").select("id, name, course_id").in("id", ids).eq("extraction_status", "needs_visual_review").order("name"),
    supabase.from("course_links").select("assessment_course_id, material_course_id"),
    supabase.from("courses").select("id, title"),
    supabase.from("material_reviews").select("material_id, outcome"),
    supabase.from("material_page_notes").select("material_id, page_number, author_kind"),
    supabase.from("material_vision_runs").select("material_id, status, message, ran_at").order("ran_at", { ascending: false }).limit(500),
  ]);
  const failed = materials.error ?? links.error ?? courses.error ?? reviews.error ?? notes.error;
  if (failed) throw new Error("Could not load the review queue. Check that the material review migration is applied.");
  const flagged = materials.data ?? [];
  if (!flagged.length) return [];
  const { data: pages, error: pageError } = await supabase.from("material_pages").select("material_id, page_number, extracted_text, table_data, has_visuals").in("material_id", flagged.map((row) => row.id));
  if (pageError) throw new Error("Could not load material pages.");
  const title = new Map((courses.data ?? []).map((row) => [row.id, row.title]));
  const linkedTo = new Map((links.data ?? []).map((row) => [row.material_course_id, row.assessment_course_id]));
  const review = new Map((reviews.data ?? []).map((row) => [row.material_id, row.outcome as string]));
  const noteCount = new Map<string, number>();
  const aiCount = new Map<string, number>();
  const described = new Map<string, Set<number>>();
  for (const row of notes.data ?? []) {
    const counts = row.author_kind === "ai_vision" ? aiCount : noteCount;
    counts.set(row.material_id, (counts.get(row.material_id) ?? 0) + 1);
    described.set(row.material_id, (described.get(row.material_id) ?? new Set<number>()).add(row.page_number as number));
  }
  const lastRun = new Map<string, { status: string; message: string }>();
  for (const run of runs.data ?? []) if (!lastRun.has(run.material_id)) lastRun.set(run.material_id, run);
  const pagesBy = new Map<string, ReviewPage[]>();
  for (const row of pages ?? []) pagesBy.set(row.material_id, [...(pagesBy.get(row.material_id) ?? []), row as ReviewPage]);
  return flagged.map((row) => ({
    id: row.id,
    name: row.name,
    course: title.get(linkedTo.get(row.course_id) ?? row.course_id) ?? "Course",
    summary: summarizeMaterialPages(pagesBy.get(row.id) ?? []),
    notes: noteCount.get(row.id) ?? 0,
    aiNotes: aiCount.get(row.id) ?? 0,
    lastRun: lastRun.get(row.id) ?? null,
    describedPages: described.get(row.id) ?? new Set<number>(),
    review: review.get(row.id) ?? null,
  })).sort((a, b) => a.course.localeCompare(b.course) || b.summary.noText - a.summary.noText);
}
