import { AppShell } from "@/components/app-shell";
import { SwotForm } from "@/components/swot-form";
import { demoData } from "@/lib/demo-data";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { buildSwotSignals, type SwotMarkEvidence } from "@/lib/insights/swot-signals";

export const dynamic = "force-dynamic";
const labels = ["strength", "weakness", "opportunity", "threat"] as const;
const colors = ["#54ad9c", "#d5a26a", "#739cc2", "#c87f79"];

export default async function SwotPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const entries = demoMode ? demoData.swot.map((item) => ({ category: ({ Strength: "strength", Development: "weakness", Opportunity: "opportunity", Risk: "threat" } as Record<string, string>)[item.category] ?? "strength", title: item.title, evidence: item.description, source_reference: "Illustrative only" })) : await loadEntries();
  const signals = demoMode ? [] : await loadSwotSignals();
  return <AppShell demoMode><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> EVIDENCE-BASED REFLECTION</div><h1>SWOT analysis</h1><p className="page-subtitle">Keep strengths, weaknesses, opportunities, and threats tied to specific evidence.</p></div></div><div className="info-callout swot-evidence-note">Draft signals use official marks and feedback. High-result signals use 85/100 or above; review flags use below 65/100. These markers guide review and do not establish mastery.</div><div className="swot-grid">{labels.map((label, index) => { const saved = entries.filter((item) => item.category === label); const drafts = signals.filter((item) => item.category === label); return <article className="swot-card" key={label}><h2><i className="swot-dot" style={{ background: colors[index] }} />{label[0].toUpperCase() + label.slice(1)}<span className="panel-count">{saved.length + drafts.length}</span></h2>{saved.map((item, itemIndex) => <div className="swot-entry" key={`saved-${item.title}-${itemIndex}`}><strong>{item.title}</strong><p>{item.evidence}</p>{item.source_reference && <small>{item.source_reference} · Saved observation</small>}</div>)}{drafts.map((item) => <div className="swot-entry swot-draft" key={`draft-${item.category}`}><strong>{item.title}</strong><p>{item.evidence}</p><small>{item.sourceReference} · Draft · {item.confidence} confidence</small></div>)}{!saved.length && !drafts.length && <p className="empty-hint">No evidence recorded for this category yet.</p>}</article>; })}</div><section className="content-panel swot-add-panel"><h2>Add an observation</h2>{demoMode ? <div className="info-callout">Preview entries are synthetic. Configure Supabase to save your own evidence.</div> : hasSupabaseConfig() ? <SwotForm /> : <div className="info-callout">Connect Supabase to save private SWOT entries.</div>}</section>{demoMode && <p className="scope-note">Preview items are illustrative, not observations about an actual student.</p>}</div></AppShell>;
}

async function loadEntries() {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("swot_entries").select("category, title, evidence, source_reference").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load SWOT entries.");
  return data ?? [];
}

async function loadSwotSignals() {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const [{ data: submissions, error }, { data: assessments }, { data: courses }] = await Promise.all([
    supabase.from("submissions").select("id, assessment_id, official_mark, official_feedback, official_mark_source").order("submitted_at", { ascending: false }),
    supabase.from("assessments").select("id, course_id, title"),
    supabase.from("courses").select("id, title"),
  ]);
  if (error) throw new Error("Could not load official marks for SWOT evidence.");
  const assessmentById = new Map((assessments ?? []).map((item) => [item.id, item]));
  const courseById = new Map((courses ?? []).map((item) => [item.id, item.title]));
  const evidence: SwotMarkEvidence[] = (submissions ?? []).map((item) => {
    const assessment = assessmentById.get(item.assessment_id);
    return {
      id: item.id,
      title: assessment?.title ?? "Assessment",
      course: assessment ? courseById.get(assessment.course_id) ?? "Course" : "Course",
      mark: item.official_mark === null ? null : Number(item.official_mark),
      feedback: item.official_feedback ?? "",
      source: item.official_mark_source,
    };
  });
  return buildSwotSignals(evidence);
}
