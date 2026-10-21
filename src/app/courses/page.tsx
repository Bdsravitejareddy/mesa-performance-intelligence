import Link from "next/link";
import { BookOpen, FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CourseCreateForm } from "@/components/course-forms";
import { CourseLinkReview } from "@/components/course-link-review";
import { suggestCourseLinks } from "@/lib/courses/links";
import { demoData } from "@/lib/demo-data";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const loaded = demoMode ? null : await loadCourses();
  const courses = demoMode ? demoData.courses.map((course) => ({ ...course, term: "Illustrative term", material_count: course.materials, assessment_count: 0, linked_to: null as string | null })) : loaded!.courses;
  const review = loaded?.review;
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> COURSE KNOWLEDGE BASE</div><h1>Courses & content</h1><p className="page-subtitle">Organise course materials and link them to assessments for evidence-based evaluation.</p></div></div>
    <div className="section-two-column"><section className="content-panel"><h2>Your courses <span className="panel-count">{courses.length}</span></h2>{courses.length ? <div className="course-list">{courses.map((course) => <Link className="course-list-row" href={`/courses/${course.id}`} key={course.id}><span className="course-list-icon"><BookOpen size={16} /></span><span><strong>{course.title}</strong><small>{course.code || "No course code"}{course.term ? ` · ${course.term}` : ""}</small></span><span className="course-list-meta"><FileText size={13} /> {course.material_count} materials · {course.assessment_count} assessments{course.linked_to ? ` · linked to ${course.linked_to}` : ""}</span></Link>)}</div> : <div className="empty-copy"><p>No courses have been added. Start by creating one and linking its materials.</p></div>}</section>
      <aside className="content-panel"><h2>Add a course</h2><p>Course records and uploads are private to your signed-in workspace.</p>{demoMode ? <div className="info-callout">Preview mode uses synthetic examples. Connect your own Supabase project to save course data.</div> : hasSupabaseConfig() ? <CourseCreateForm /> : <div className="info-callout">Configure Supabase to create private course records.</div>}</aside></div>
    {review && <section className="content-panel"><h2>Link course materials to LMS courses</h2><p className="empty-hint">The LMS and Drive create separate course records. Linking a Drive course to its LMS course lets assessments in that course be evaluated against its materials. Records are not moved or merged, and a link can be removed.</p><CourseLinkReview {...review} /></section>}
    {demoMode && <p className="scope-note">All course names, counts, and records in preview mode are synthetic examples.</p>}
  </div></AppShell>;
}

async function loadCourses() {
  if (!hasSupabaseConfig()) return { courses: [], review: null };
  const supabase = await createClient();
  const [{ data, error }, { data: linkRows, error: linkError }] = await Promise.all([
    supabase.from("courses").select("id, code, title, term, lms_course_id, course_materials(count), assessments(count)").order("created_at", { ascending: false }),
    supabase.from("course_links").select("assessment_course_id, material_course_id"),
  ]);
  if (error || linkError) throw new Error("Could not load courses. Check the database migration and workspace connection.");
  const count = (value: unknown) => Array.isArray(value) ? Number(value[0]?.count ?? 0) : 0;
  const rows = (data ?? []).map((course) => ({ id: course.id, code: course.code, title: course.title, term: course.term, lmsId: course.lms_course_id as string | null, material_count: count(course.course_materials), assessment_count: count(course.assessments) }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const links = linkRows ?? [];
  const linkedMaterial = new Map(links.map((link) => [link.material_course_id, link.assessment_course_id]));
  const detail = (row: (typeof rows)[number]) => `${row.material_count} materials · ${row.assessment_count} assessments`;
  const asCourse = (row: (typeof rows)[number]) => ({ id: row.id, title: row.title, detail: detail(row) });
  // Assessment courses come from the LMS or hold assessments; material courses hold documents and no assessments.
  const assessmentCourses = rows.filter((row) => row.lmsId || row.assessment_count > 0);
  const unlinkedMaterial = rows.filter((row) => !row.lmsId && row.assessment_count === 0 && row.material_count > 0 && !linkedMaterial.has(row.id));
  const suggestions = suggestCourseLinks(unlinkedMaterial, assessmentCourses).map((pair) => ({ material: asCourse(byId.get(pair.materialCourse.id)!), assessment: asCourse(byId.get(pair.assessmentCourse.id)!) }));
  const linkedPairs = links.flatMap((link) => { const material = byId.get(link.material_course_id); const assessment = byId.get(link.assessment_course_id); return material && assessment ? [{ material: asCourse(material), assessment: asCourse(assessment) }] : []; });
  return {
    courses: rows.map((row) => ({ ...row, linked_to: linkedMaterial.has(row.id) ? byId.get(linkedMaterial.get(row.id)!)?.title ?? null : null })),
    review: { suggestions, links: linkedPairs, unlinkedMaterial: unlinkedMaterial.map(asCourse), assessmentCourses: assessmentCourses.map(asCourse) },
  };
}
