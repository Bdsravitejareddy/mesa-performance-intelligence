import Link from "next/link";
import { BookOpen, FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Why } from "@/components/why";
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
  // One card per course: a Drive folder linked to an LMS course is folded into it rather than listed again.
  const folded = courses.filter((course) => !course.linked_to);
  const folders = new Map<string, { title: string; materials: number }[]>();
  for (const course of courses) if (course.linked_to) folders.set(course.linked_to, [...(folders.get(course.linked_to) ?? []), { title: course.title, materials: course.material_count }]);
  const termOrder = (term: string | null) => (term === "Pre-Term" ? 0 : term === "Term 1" ? 1 : term === "Term 2" ? 2 : 3);
  const terms = [...new Set(folded.map((course) => course.term || "Other"))].sort((a, b) => termOrder(a) - termOrder(b));
  const split = (title: string) => { const match = title.match(/^(.*?)\s+with\s+(.+)$/i); return match ? { name: match[1], by: match[2] } : { name: title, by: "" }; };
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> COURSE KNOWLEDGE BASE</div><h1>Courses & content</h1><p className="page-subtitle">{folded.length} courses, each with its assessments and the course material it is graded against.</p></div></div>
    {folded.length ? terms.map((term) => { const list = folded.filter((course) => (course.term || "Other") === term); return <section key={term} className="course-term" aria-label={term}>
      <h2 className="course-term-title">{term} <span className="panel-count">{list.length}</span></h2>
      <div className="course-grid">{list.map((course) => { const { name, by } = split(course.title); const drive = folders.get(course.title) ?? []; const materials = course.material_count + drive.reduce((sum, folder) => sum + folder.materials, 0); return <Link className="course-card" href={`/courses/${course.id}`} key={course.id}>
        <span className="course-card-icon"><BookOpen size={16} /></span>
        <span className="course-card-body"><strong>{name}</strong>{by && <small>{by}</small>}</span>
        <span className="course-card-meta"><span><b>{course.assessment_count}</b> assessments</span><span><FileText size={12} /> <b>{materials}</b> materials{drive.length ? <small> · incl. Drive</small> : ""}</span></span>
      </Link>; })}</div>
    </section>; }) : <div className="content-panel empty-copy"><p>No courses yet. They arrive from the LMS sync, or add one below.</p></div>}
    {review && <section className="content-panel course-admin"><Why label={`Drive folders linked to courses (${review.links.length}${review.suggestions.length + review.unlinkedMaterial.length ? ` · ${review.unlinkedMaterial.length} not linked yet` : ""})`}><p className="empty-hint">Each Drive course folder is linked to its LMS course, so that course's assessments are graded against the folder's materials. Records are not moved or merged, and a link can be removed.</p><CourseLinkReview {...review} /></Why>
      <Why label="Add a course manually"><p className="empty-hint">Courses normally arrive from the LMS. Records and uploads are private to your workspace.</p>{hasSupabaseConfig() ? <CourseCreateForm /> : <div className="info-callout">Configure Supabase to create private course records.</div>}</Why></section>}
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
