import { AppShell } from "@/components/app-shell";
import { AIConsentGate } from "@/components/ai-consent-gate";
import { ProfessionalEvidenceForm, ProfessionalEvidenceList } from "@/components/professional-evidence";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedRead } from "@/lib/data/cached";

export const dynamic = "force-dynamic";

export default async function ProfessionalEvidencePage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const items = demoMode || !hasSupabaseConfig() ? null : await load();
  const claims = items?.flatMap((item) => item.claims) ?? [];
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Professional evidence</div><h1>Resume & portfolio</h1><p className="page-subtitle">A resume line is evidence of a claim, not proof of proficiency. Claims become supported only when another item backs them.</p></div></div>
    {items && <section className="competency-summary" aria-label="Claims"><div className="competency-summary-item"><strong>{items.length}</strong><span>Evidence items</span></div><div className="competency-summary-item"><strong>{claims.filter((claim) => claim.status === "claimed").length}</strong><span>Claims not yet supported</span></div><div className="competency-summary-item"><strong>{claims.filter((claim) => claim.status === "supported" || claim.status === "attested").length}</strong><span>Supported claims{claims.some((claim) => claim.status === "attested") ? ` (${claims.filter((claim) => claim.status === "attested").length} confirmed by you)` : ""}</span></div><div className="competency-summary-item"><strong>{claims.filter((claim) => claim.quantified).length}</strong><span>Quantified claims</span></div></section>}
    <div className="section-two-column"><section className="content-panel"><h2>Your evidence</h2>{items ? <ProfessionalEvidenceList items={items} /> : <p className="empty-hint">Connect Supabase to add evidence.</p>}</section>
      <aside className="content-panel"><h2>Add evidence</h2>{items ? <AIConsentGate purpose="Claims are extracted from what you add using Gemini."><ProfessionalEvidenceForm /></AIConsentGate> : null}</aside></div>
  </div></AppShell>;
}

async function load() {
  return cachedRead("professional:load", loadWith);
}

async function loadWith(supabase: SupabaseClient) {
  const [evidence, claims, competencies] = await Promise.all([
    supabase.from("professional_evidence").select("id, kind, title, description, url, issued_by, storage_path, created_at").order("created_at", { ascending: false }),
    supabase.from("professional_claims").select("id, evidence_id, claim, claim_type, quantified, competency_id, status, supporting_evidence_id, supporting_note").order("created_at"),
    supabase.from("competencies").select("id, name"),
  ]);
  if (evidence.error || claims.error) throw new Error("Could not load professional evidence. Check that the migration is applied.");
  const competencyName = new Map((competencies.data ?? []).map((row) => [row.id, row.name]));
  const titles = new Map((evidence.data ?? []).map((row) => [row.id, row.title]));
  return (evidence.data ?? []).map((item) => ({
    id: item.id, kind: item.kind, title: item.title, description: item.description, url: item.url, issued_by: item.issued_by, hasFile: Boolean(item.storage_path), created_at: item.created_at,
    claims: (claims.data ?? []).filter((claim) => claim.evidence_id === item.id).map((claim) => ({ id: claim.id, claim: claim.claim, claim_type: claim.claim_type, quantified: claim.quantified, competency: claim.competency_id ? competencyName.get(claim.competency_id) ?? null : null, status: claim.status, supporting: claim.supporting_evidence_id ? titles.get(claim.supporting_evidence_id) ?? null : null, supporting_note: claim.supporting_note })),
  }));
}
