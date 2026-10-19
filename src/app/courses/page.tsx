import Link from "next/link";
import { BookOpen, FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CourseCreateForm } from "@/components/course-forms";
import { demoData } from "@/lib/demo-data";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const courses = demoMode ? demoData.courses.map((course) => ({ ...course, term: "Illustrative term", material_count: course.materials })) : await loadCourses();
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> COURSE KNOWLEDGE BASE</div><h1>Courses & content</h1><p className="page-subtitle">Organise course materials and link them to assessments for evidence-based evaluation.</p></div></div>
    <div className="section-two-column"><section className="content-panel"><h2>Your courses <span className="panel-count">{courses.length}</span></h2>{courses.length ? <div className="course-list">{courses.map((course) => <Link className="course-list-row" href={`/courses/${course.id}`} key={course.id}><span className="course-list-icon"><BookOpen size={16} /></span><span><strong>{course.title}</strong><small>{course.code || "No course code"}{course.term ? ` · ${course.term}` : ""}</small></span><span className="course-list-meta"><FileText size={13} /> {"material_count" in course ? course.material_count : 0} materials</span></Link>)}</div> : <div className="empty-copy"><p>No courses have been added. Start by creating one and linking its materials.</p></div>}</section>
      <aside className="content-panel"><h2>Add a course</h2><p>Course records and uploads are private to your signed-in workspace.</p>{demoMode ? <div className="info-callout">Preview mode uses synthetic examples. Connect your own Supabase project to save course data.</div> : hasSupabaseConfig() ? <CourseCreateForm /> : <div className="info-callout">Configure Supabase to create private course records.</div>}</aside></div>
    {demoMode && <p className="scope-note">All course names, counts, and records in preview mode are synthetic examples.</p>}
  </div></AppShell>;
}

async function loadCourses() {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("courses").select("id, code, title, term, course_materials(count)").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load courses. Check the database migration and workspace connection.");
  return (data ?? []).map((course) => ({ ...course, material_count: Array.isArray(course.course_materials) ? course.course_materials[0]?.count ?? 0 : 0 }));
}
