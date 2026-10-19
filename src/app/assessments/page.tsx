import Link from "next/link";
import { ArrowRight, FileCheck2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { demoData } from "@/lib/demo-data";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AssessmentsPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const records = demoMode ? demoData.assessments.map((item) => ({ ...item, courseId: "", maximum: 100, status: "Illustrative" })) : await loadAssessments();
  return <AppShell demoMode><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> EVIDENCE AND RUBRICS</div><h1>Assessments</h1><p className="page-subtitle">Link student work, official marks, feedback, and course evidence to each assessment.</p></div></div>
    <section className="content-panel"><h2>Assessment register <span className="panel-count">{records.length}</span></h2>{records.length ? records.map((item) => <Link className="assessment-register-row" href={demoMode ? "/marks" : `/courses/${item.courseId}`} key={item.id}><span className="assessment-icon icon-mint"><FileCheck2 size={16} /></span><span><strong>{item.title}</strong><small>{item.course} · {item.format} · maximum {item.maximum}/100</small></span><span className="assessment-status">{item.status}</span><ArrowRight size={15} /></Link>) : <div className="empty-copy"><p>Create a course, then add its assessment and link course content.</p><Link href="/courses">Open courses <ArrowRight size={14} /></Link></div>}</section>
    <div className="three-layer-grid"><Layer name="Mesa Academic Evaluation" description="Course requirements, learning outcomes, and approved rubric." /><Layer name="Objective Analytical Evaluation" description="Methods, calculations, assumptions, evidence, and conclusions." /><Layer name="Professional Readiness Evaluation" description="A selected role profile and its declared competency evidence." /></div>
    <p className="scope-note">AI rubric drafting and evaluation are not active until a model provider is configured and relevant-data processing is approved. No scores are inferred in this build.</p>
  </div></AppShell>;
}

async function loadAssessments() {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const [{ data: assessments, error }, { data: courses }] = await Promise.all([
    supabase.from("assessments").select("id, course_id, title, assessment_format, official_max_mark").order("created_at", { ascending: false }),
    supabase.from("courses").select("id, title"),
  ]);
  if (error) throw new Error("Could not load assessments.");
  const names = new Map((courses ?? []).map((item) => [item.id, item.title]));
  return (assessments ?? []).map((item) => ({ id: item.id, courseId: item.course_id, title: item.title, course: names.get(item.course_id) ?? "Course", format: item.assessment_format, maximum: Number(item.official_max_mark), status: "Awaiting evidence" }));
}

function Layer({ name, description }: { name: string; description: string }) {
  return <article className="layer-card"><div className="layer-card-head"><span className="layer-label">{name}</span><span className="not-configured">Not evaluated</span></div><p>{description}</p></article>;
}
