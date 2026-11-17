import { unwrapToolResult } from "./normalize";

// A term report card as Nexus's get_grades returns it (Attendance & Grade → Grade). These are official results:
// the term GPA, and each course's percentage, grade points, credits and letter grade.
export type ReportCardCourse = { course: string; credits: number | null; grade: string; gpa: number | null; percentage: number | null; failed: boolean };
export type ReportCard = {
  term: string; program: string; overallGrade: string; gpa: number | null; cgpa: number | null;
  creditsEarned: number | null; creditsAttempted: number | null; attendancePct: number | null; failed: boolean;
  courses: ReportCardCourse[];
};

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => (value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null);
const text = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : typeof value === "number" ? String(value) : "");
// Nexus sends numbers as strings ("22.00"); a blank or non-numeric value stays unknown rather than zero.
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim().replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeReportCards(value: unknown): ReportCard[] {
  const root = object(unwrapToolResult(value));
  const cards = Array.isArray(root?.reportCards) ? root.reportCards : [];
  return cards.map(object).filter((card): card is JsonObject => Boolean(card && text(card.term))).map((card) => ({
    term: text(card.term, 60),
    program: text(card.program),
    overallGrade: text(card.overallGrade, 10),
    gpa: num(card.gpa),
    cgpa: num(card.cgpa),
    creditsEarned: num(card.creditsEarned),
    creditsAttempted: num(card.creditsAttempted),
    attendancePct: num(card.attendancePct),
    failed: card.failed === true,
    courses: (Array.isArray(card.courses) ? card.courses : []).map(object).filter((course): course is JsonObject => Boolean(course && text(course.course))).slice(0, 60).map((course) => ({
      course: text(course.course),
      credits: num(course.credits),
      grade: text(course.grade, 10),
      gpa: num(course.gpa),
      percentage: num(course.percentage),
      failed: course.failed === true,
    })),
  }));
}
