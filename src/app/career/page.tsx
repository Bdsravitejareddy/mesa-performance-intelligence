import { AppShell } from "@/components/app-shell";
import { CareerGapChecker } from "@/components/career-gap-checker";
import { RoleProfileForm } from "@/components/role-profile-form";
import { RoleTargets } from "@/components/role-targets";
import { loadCompetencyInputs } from "@/lib/competency/load";
import { buildCompetencyMap } from "@/lib/competency/map";
import { buildLibrary } from "@/lib/roles/library";
import { roleReadiness } from "@/lib/roles/readiness";
import { demoData } from "@/lib/demo-data";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedRead } from "@/lib/data/cached";

export const dynamic = "force-dynamic";

export default async function CareerPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const profiles = demoMode ? [] : await loadProfiles();
  const targets = demoMode || !hasSupabaseConfig() ? null : await loadTargets();
  return <AppShell demoMode={demoMode}><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> ROLE-BASED GAP ANALYSIS</div><h1>Career readiness</h1><p className="page-subtitle">Compare course evidence with a role profile whose source is clear.</p></div></div><div className="section-two-column"><section className="content-panel"><h2>Resume-to-role gap check</h2><CareerGapChecker /></section><aside className="content-panel"><h2>Illustrative skill evidence</h2>{demoData.qualityFindings.slice(0, 2).map((item) => <div className="quality-finding" key={item.title}><span className="quality-level">Sample</span><div><strong>{item.title}</strong><p>{item.text}</p></div></div>)}<p className="scope-note">These examples are synthetic and are not a real role benchmark or an evaluation of a student&apos;s resume.</p></aside></div>
    {targets && <RoleTargets readiness={targets.readiness} library={targets.library} />}
    <h2 className="role-stage">Your own role profiles</h2>
    <div className="section-two-column career-profile-grid"><section className="content-panel"><h2>Your role profiles <span className="panel-count">{profiles.length}</span></h2>{profiles.length ? profiles.map((profile) => <article className="role-profile-row" key={profile.id}><strong>{profile.title}</strong><small>{profile.employer || "Employer not specified"} · {profile.industry || "Industry not specified"}</small><small>{profile.is_verified ? "Verified by explicit page text" : profile.benchmark_source === "user_confirmed_unverified" ? "User-confirmed details · unverified · excluded from benchmarking" : "User-supplied · unverified · excluded from benchmarking"}{profile.posting_date ? ` · ${profile.is_verified ? "Page-confirmed" : "User-entered"} posting date ${profile.posting_date}` : " · Posting date unknown"}{profile.retrieved_at ? ` · Retrieved ${new Date(profile.retrieved_at).toLocaleDateString()}` : ""}</small>{profile.source_url && <a href={profile.source_url} target="_blank" rel="noreferrer">Open source page</a>}<p>{profile.competencies.map((item) => typeof item === "string" ? item : item.title).join(" · ")}</p></article>) : <div className="empty-copy"><p>No role profile is saved. Add competencies from a job description or a source you trust.</p></div>}</section><section className="content-panel"><h2>Add a sourced role profile</h2>{demoMode ? <div className="info-callout">Connect Supabase to save a private profile. You can still try local phrase matching above.</div> : hasSupabaseConfig() ? <RoleProfileForm /> : <div className="info-callout">Connect Supabase to save a private profile.</div>}</section></div>
  </div></AppShell>;
}

async function loadProfiles() {
  if (!hasSupabaseConfig()) return [];
  return cachedRead("career:loadProfiles", loadProfilesWith);
}

async function loadProfilesWith(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("role_profiles").select("id, title, industry, employer, benchmark_source, source_url, retrieved_at, posting_date, is_verified, competencies").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load role profiles.");
  return (data ?? []).map((profile) => ({ ...profile, competencies: Array.isArray(profile.competencies) ? profile.competencies as Array<string | { title: string }> : [] }));
}

async function loadTargets() {
  return cachedRead("career:loadTargets", loadTargetsWith);
}

async function loadTargetsWith(supabase: SupabaseClient) {
  const [inputs, claims] = await Promise.all([loadCompetencyInputs(supabase), supabase.from("professional_claims").select("competency_id, status").not("competency_id", "is", null)]);
  const competencies = new Map(buildCompetencyMap(inputs).flatMap((domain) => domain.competencies).map((entry) => [entry.id, { state: entry.assessment.state, name: entry.name }]));
  const library = buildLibrary();
  return { library, readiness: library.map((role) => roleReadiness(role, competencies, (claims.data ?? []).map((row) => ({ competencyId: row.competency_id as string, status: row.status as string })))) };
}
