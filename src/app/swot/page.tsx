import { AppShell } from "@/components/app-shell";
import { SwotForm } from "@/components/swot-form";
import { demoData } from "@/lib/demo-data";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const labels = ["strength", "weakness", "opportunity", "threat"] as const;
const colors = ["#54ad9c", "#d5a26a", "#739cc2", "#c87f79"];

export default async function SwotPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const entries = demoMode ? demoData.swot.map((item) => ({ category: ({ Strength: "strength", Development: "weakness", Opportunity: "opportunity", Risk: "threat" } as Record<string, string>)[item.category] ?? "strength", title: item.title, evidence: item.description, source_reference: "Illustrative only" })) : await loadEntries();
  return <AppShell demoMode><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> EVIDENCE-BASED REFLECTION</div><h1>SWOT analysis</h1><p className="page-subtitle">Keep strengths, weaknesses, opportunities, and threats tied to specific evidence.</p></div></div><div className="swot-grid">{labels.map((label, index) => <article className="swot-card" key={label}><h2><i className="swot-dot" style={{ background: colors[index] }} />{label[0].toUpperCase() + label.slice(1)}<span className="panel-count">{entries.filter((item) => item.category === label).length}</span></h2>{entries.filter((item) => item.category === label).map((item, itemIndex) => <div className="swot-entry" key={`${item.title}-${itemIndex}`}><strong>{item.title}</strong><p>{item.evidence}</p>{item.source_reference && <small>{item.source_reference}</small>}</div>)}{!entries.some((item) => item.category === label) && <p className="empty-hint">No evidence recorded for this category.</p>}</article>)}</div><section className="content-panel swot-add-panel"><h2>Add an observation</h2>{demoMode ? <div className="info-callout">Preview entries are synthetic. Configure Supabase to save your own evidence.</div> : hasSupabaseConfig() ? <SwotForm /> : <div className="info-callout">Connect Supabase to save private SWOT entries.</div>}</section>{demoMode && <p className="scope-note">Preview items are illustrative, not observations about an actual student.</p>}</div></AppShell>;
}

async function loadEntries() {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("swot_entries").select("category, title, evidence, source_reference").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load SWOT entries.");
  return data ?? [];
}
