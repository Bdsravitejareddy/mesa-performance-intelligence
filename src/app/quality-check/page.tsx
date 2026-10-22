import { AppShell } from "@/components/app-shell";
import { DeleteCheckButton, QualityChecker } from "@/components/quality-checker";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedRead } from "@/lib/data/cached";

export const dynamic = "force-dynamic";

export default async function QualityCheckPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const data = demoMode || !hasSupabaseConfig() ? null : await load();
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Independent evaluation</div><h1>Quality checker</h1><p className="page-subtitle">A first-impression evaluation against a transparent standard, before context or reputation is considered.</p></div></div>
    <section className="content-panel">{data ? <QualityChecker assessments={data.assessments} roles={data.roles} documents={data.documents} /> : <p className="empty-hint">{demoMode ? "Preview mode does not run evaluations." : "Connect Supabase to run evaluations."}</p>}</section>
    {data && data.history.length > 0 && <section className="content-panel"><h2>History <span className="panel-count">{data.history.length}</span></h2><div className="link-list">{data.history.map((row) => <div className="link-row" key={row.id}><span><strong>{row.title}</strong><small>{new Date(row.created_at).toLocaleString()} · {row.mode === "role" ? "Role" : "Criteria"} · {row.standard_label}</small></span><span className="link-arrow" aria-hidden>·</span><span><strong>{row.overall_score === null ? "Not scored" : `${Number(row.overall_score)}/100`}</strong><small>Model evaluation, not an official grade</small></span><DeleteCheckButton id={row.id} /></div>)}</div></section>}
  </div></AppShell>;
}

async function load() {
  return cachedRead("quality-check:load", loadWith);
}

async function loadWith(supabase: SupabaseClient) {
  const [assessments, courses, roles, documents, history] = await Promise.all([
    supabase.from("assessments").select("id, title, course_id").order("title"),
    supabase.from("courses").select("id, title"),
    supabase.from("role_profiles").select("id, title, employer").order("created_at", { ascending: false }),
    supabase.from("submission_documents").select("id, name, submission_id, extraction_status").order("created_at", { ascending: false }).limit(100),
    supabase.from("quality_checks").select("id, title, mode, standard_label, overall_score, created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  const courseTitle = new Map((courses.data ?? []).map((row) => [row.id, row.title]));
  return {
    assessments: (assessments.data ?? []).map((row) => ({ id: row.id, label: `${row.title} · ${courseTitle.get(row.course_id) ?? "Course"}` })),
    roles: (roles.data ?? []).map((row) => ({ id: row.id, label: `${row.title}${row.employer ? ` · ${row.employer}` : ""}` })),
    documents: (documents.data ?? []).filter((row) => row.extraction_status !== "failed").map((row) => ({ id: row.id, label: row.name })),
    history: (history.data ?? []) as { id: string; title: string; mode: string; standard_label: string; overall_score: number | null; created_at: string }[],
  };
}
