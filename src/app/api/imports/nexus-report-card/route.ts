import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { reportCardUrl, storedSourceId } from "@/lib/imports/nexus";
import { readReportCardPdf } from "@/lib/imports/report-card-pdf";

export const maxDuration = 60;
const MAX_BYTES = 5 * 1024 * 1024;

// Member-approved, read-only capture (see AGENTS.md): the official grade report PDF that the member's signed-in
// Nexus shows under Attendance & Grade → Grade → Report card. Its component breakdown (weights, marks obtained,
// maxima, cumulative and grade per course) joins that term's report card. The PDF arrives as an upload, or as
// Nexus's short-lived signed link, fetched here; the link itself is never stored. Guests cannot reach this route.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let bytes: Uint8Array | null = null;
  let source = "Mesa grade report PDF (uploaded)";
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (file instanceof File && file.size > 0 && file.size <= MAX_BYTES) bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
      const url = typeof body?.url === "string" ? reportCardUrl(body.url) : null;
      if (!url) return NextResponse.json({ error: "Not a Nexus report card link." }, { status: 400 });
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) return NextResponse.json({ error: `The signed link returned HTTP ${response.status}; it may have expired — open the report card again.` }, { status: 502 });
      const fetched = new Uint8Array(await response.arrayBuffer());
      if (fetched.byteLength <= MAX_BYTES) bytes = fetched;
      source = `Mesa grade report PDF (Nexus ${storedSourceId(url)})`;
    }
  } catch {
    return NextResponse.json({ error: "The report card could not be read." }, { status: 400 });
  }
  if (!bytes || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "Upload the report card PDF (at most 5 MiB)." }, { status: 400 });

  let report: Awaited<ReturnType<typeof readReportCardPdf>>;
  try { report = await readReportCardPdf(bytes); }
  catch (reason) { return NextResponse.json({ error: reason instanceof Error ? reason.message : "The PDF could not be read as a grade report." }, { status: 422 }); }
  if (!report.term || !report.breakdown.length) return NextResponse.json({ error: "No term or course breakdown was found in this PDF." }, { status: 422 });

  // The daily sync owns the term row; the breakdown joins it, or starts it if the sync has not read that term yet.
  const { data: existing } = await supabase.from("lms_report_cards").select("id, courses").eq("term", report.term).limit(1).maybeSingle();
  // Course names as the sync read them, where the PDF's spacing differs only by spaces.
  const synced = new Map(((existing?.courses ?? []) as { course: string }[]).map((course) => [course.course.toLowerCase().replace(/\s+/g, ""), course.course]));
  for (const course of report.breakdown) course.course = synced.get(course.course.toLowerCase().replace(/\s+/g, "")) ?? course.course;
  const fields = { breakdown: report.breakdown, out_class: report.outClass, breakdown_source: source.slice(0, 200), breakdown_generated_on: report.generatedOn, breakdown_imported_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from("lms_report_cards").update(fields).eq("id", existing.id)
    : await supabase.from("lms_report_cards").insert({ user_id: claims.claims.sub, term: report.term, ...fields });
  if (error) return NextResponse.json({ error: "The breakdown was read but could not be saved." }, { status: 500 });
  const disagreements = report.breakdown.filter((course) => course.agrees === false).map((course) => ({ course: course.course, printed: course.cumulative, computed: course.computed }));
  return NextResponse.json({ term: report.term, courses: report.breakdown.length, components: report.breakdown.reduce((sum, course) => sum + course.components.length, 0), outClass: report.outClass.length, disagreements }, { status: 201 });
}
