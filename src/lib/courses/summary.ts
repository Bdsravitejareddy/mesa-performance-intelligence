import { stakesOf } from "@/lib/assessments/stakes";

// A course at a glance for a reader who will not open every assessment: the official result if the report card
// has one, how many graded marks are released, where the official evidence is strongest and weakest, and what is
// still to come. Official figures only; practice tasks are counted apart so they do not inflate the course.

type CardCourse = { course: string; percentage?: number | string | null; grade?: string | null; credits?: number | string | null };
type CardComponent = { name: string; weightPct: number; marks: number; max: number };
type Card = { term: string; courses?: CardCourse[] | null; breakdown?: { course: string; components?: CardComponent[] | null }[] | null };
type Assessment = { id: string; title: string; counts_toward_grade?: boolean | null; due_at?: string | null };

export type CourseSummary = {
  official: { term: string; percentage: number | null; grade: string; credits: number | null } | null;
  graded: number; practice: number; released: number;
  strongest: { name: string; detail: string } | null;
  weakest: { name: string; detail: string } | null;
  basis: "report_card" | "assessment_marks" | null;
  upcoming: number; awaiting: number; next: { title: string; due: string } | null;
};

const key = (name: string) => name.toLowerCase().replace(/\s+/g, "");
const short = (name: string) => name.replace(/\s+with\s+.*$/i, "");
const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));
const fmt = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
// Report-card names are compared without spaces (the PDF can split a name); the "with Prof…" tail may be absent.
const sameCourse = (a: string, b: string) => key(a) === key(b) || key(short(a)) === key(short(b));

// "out of 100", never a bare "100/100", which reads as a perfect score. The original scale is kept beside it.
export function maxLabel(max: number | string | null | undefined, originalMax?: number | string | null): string {
  const value = num(max) ?? 100;
  const original = num(originalMax);
  return `out of ${fmt(value)}${original !== null && original !== value ? ` (marked out of ${fmt(original)})` : ""}`;
}

export function courseSummary(input: { title: string; cards: Card[]; assessments: Assessment[]; marks: Map<string, number>; now?: Date }): CourseSummary {
  const now = input.now ?? new Date();
  let official: CourseSummary["official"] = null;
  let components: CardComponent[] = [];
  for (const card of input.cards) {
    const course = (card.courses ?? []).find((item) => sameCourse(item.course, input.title));
    const breakdown = (card.breakdown ?? []).find((item) => sameCourse(item.course, input.title));
    if (course && !official) official = { term: card.term, percentage: num(course.percentage), grade: course.grade ?? "", credits: num(course.credits) };
    if (breakdown?.components?.length && !components.length) components = breakdown.components.filter((item) => item.max > 0);
  }
  const graded = input.assessments.filter((item) => stakesOf(item.title, item.counts_toward_grade ?? true) !== "practice");
  const practice = input.assessments.length - graded.length;
  const marked = graded.filter((item) => input.marks.has(item.id)).map((item) => ({ name: item.title, share: input.marks.get(item.id)! / 100, detail: `${fmt(input.marks.get(item.id)!)} out of 100` }));
  // The report card's components cover the whole course, so they are the better basis when imported.
  const evidence = components.length >= 2
    ? components.map((item) => ({ name: item.name, share: item.marks / item.max, detail: `${fmt(item.marks)}/${fmt(item.max)}, ${fmt(item.weightPct)}% of the course` }))
    : marked;
  const ranked = [...evidence].sort((a, b) => b.share - a.share);
  const enough = ranked.length >= 2 && ranked[0].share !== ranked[ranked.length - 1].share;
  const open = graded.filter((item) => !input.marks.has(item.id));
  const future = open.filter((item) => item.due_at && new Date(item.due_at) > now).sort((a, b) => a.due_at!.localeCompare(b.due_at!));
  return {
    official, graded: graded.length, practice, released: marked.length,
    strongest: enough ? { name: ranked[0].name, detail: ranked[0].detail } : null,
    weakest: enough ? { name: ranked[ranked.length - 1].name, detail: ranked[ranked.length - 1].detail } : null,
    basis: enough ? (components.length >= 2 ? "report_card" : "assessment_marks") : null,
    upcoming: future.length, awaiting: open.length - future.length,
    next: future[0] ? { title: future[0].title, due: future[0].due_at! } : null,
  };
}

// "PreRead_Session 2_Zomato (1).pdf" and "PreRead_Session 2_Zomato.pdf" are one document uploaded twice.
export const duplicateKey = (name: string) => name.toLowerCase().replace(/\s*\(\d+\)(?=\.[a-z0-9]+$|$)/, "").replace(/^copy of\s+/, "").trim();
export function groupDuplicates<T extends { name: string }>(items: T[]): { item: T; copies: T[] }[] {
  const groups = new Map<string, { item: T; copies: T[] }>();
  for (const item of items) {
    const group = groups.get(duplicateKey(item.name));
    if (group) group.copies.push(item); else groups.set(duplicateKey(item.name), { item, copies: [] });
  }
  return [...groups.values()];
}
