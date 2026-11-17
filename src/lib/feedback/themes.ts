import { inTerm, type TermChoice } from "@/lib/term";
import { THEMES, tag, type StoredPoint } from "./repository";

// Reading the feedback repository at a glance, deterministically (no model): near-identical points are one row
// (the same comment arriving from the LMS and the Mesa Feedback page, or repeated across assessments), rows are
// ranked by how often they recur, and rows are gathered into a few named recurring themes. Faculty always lead;
// an AI grader point never stands in for a faculty one.

const STOP = new Set("the and for with that this your you are was were but not have has had from into than then them they their there its it's our out can could should would will just also more less very too only some any all one two use used using make made does did done what when which who how why been being about over under onto per each both other such these those may might must need needs".split(" "));

// Content words, lightly stemmed, so "sheets"/"sheet" and "added"/"adds" meet.
export function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length >= 3 && !STOP.has(word)).map((word) => word.replace(/(ing|ed|es|s)$/, "")).filter((word) => word.length >= 3));
}

export function similarity(a: string, b: string): number {
  const [x, y] = [words(a), words(b)];
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared += 1;
  return shared / (x.size + y.size - shared);
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// The same point: identical once punctuation is ignored, one wholly inside the other, or most content words shared.
export const samepoint = (a: string, b: string) => { const [x, y] = [squash(a), squash(b)]; return x === y || (Math.min(x.length, y.length) >= 24 && (x.includes(y) || y.includes(x))) || similarity(a, b) >= 0.6; };

export type FeedbackGroup = { key: string; text: string; points: StoredPoint[]; faculty: boolean; ai: boolean; open: boolean; latest: string | null; where: string[] };

// Groups near-identical points (faculty first, newest first), so one comment from two sources is one row.
export function groupPoints(points: StoredPoint[]): FeedbackGroup[] {
  const groups: StoredPoint[][] = [];
  const ordered = [...points].sort((a, b) => Number(a.authority === "ai") - Number(b.authority === "ai") || (b.givenOn ?? "").localeCompare(a.givenOn ?? ""));
  for (const point of ordered) {
    const home = groups.find((group) => group.some((other) => samepoint(other.text, point.text)));
    if (home) home.push(point); else groups.push([point]);
  }
  return groups.map((group) => ({
    key: group[0].id, text: group[0].text, points: group,
    faculty: group.some((point) => point.authority === "faculty"), ai: group.some((point) => point.authority === "ai"),
    open: group.some((point) => !point.addressedAt), latest: group.map((point) => point.givenOn ?? "").sort().at(-1) || null,
    where: [...new Set(group.map(placeOf))],
  }));
}

// Where a point came from, in words: the assessment, and the source when it is not the LMS.
export const placeOf = (point: StoredPoint) => `${point.assessmentTitle || point.courseTitle || "Feedback"}${point.source === "mesa_feedback_page" ? " · Mesa Feedback page" : point.source === "ai_grader" ? " · AI grader · not official" : ""}`;

// Most useful first: still open, raised by faculty, recurring, recent.
export const rankGroups = <T extends FeedbackGroup>(groups: T[]) => [...groups].sort((a, b) => Number(b.open) - Number(a.open) || Number(b.faculty) - Number(a.faculty) || b.points.length - a.points.length || (b.latest ?? "").localeCompare(a.latest ?? ""));

export type Theme = { id: string; name: string; count: number; open: number; faculty: number; aiOnly: number; courses: string[]; quotes: { text: string; who: "faculty" | "ai"; where: string }[] };

// The recurring themes across all courses: each distinct point (one row, however many sources) counted once, under
// its main theme; points with no named theme that still resemble each other form a theme of their own. A theme
// needs at least two distinct points to count as recurring.
export function recurringThemes(groups: (FeedbackGroup & { course: string })[], limit = 5): Theme[] {
  const buckets = new Map<string, (FeedbackGroup & { course: string })[]>();
  const loose: (FeedbackGroup & { course: string })[][] = [];
  for (const group of groups) {
    const main = tag(group.text).themes[0];
    if (main) { buckets.set(main, [...(buckets.get(main) ?? []), group]); continue; }
    const home = loose.find((cluster) => cluster.some((other) => similarity(other.text, group.text) >= 0.34));
    if (home) home.push(group); else loose.push([group]);
  }
  const themes = [...[...buckets].map(([id, members]) => ({ id, name: THEMES[id].label, members })), ...loose.map((members) => ({ id: `other-${members[0].key}`, name: `Repeated point: “${shorten(members[0].text, 70)}”`, members }))];
  return themes.filter((theme) => theme.members.length >= 2).map(({ id, name, members }) => {
    const ranked = rankGroups(members);
    const first = ranked[0], second = ranked.find((group) => group !== first && (group.course !== first.course || group.faculty !== first.faculty)) ?? ranked[1];
    return {
      id, name, count: members.length, open: members.filter((group) => group.open).length,
      faculty: members.filter((group) => group.faculty).length, aiOnly: members.filter((group) => !group.faculty).length,
      courses: [...new Set(members.map((group) => group.course))],
      quotes: [first, second].filter(Boolean).map((group) => ({ text: shorten(group!.text, 220), who: group!.faculty ? "faculty" as const : "ai" as const, where: `${group!.course} · ${group!.where[0]}` })),
    };
  }).sort((a, b) => b.count - a.count || b.faculty - a.faculty || a.name.localeCompare(b.name)).slice(0, limit);
}

// The header's term filter: under a term, only points from that term's courses (a point with no known course
// belongs to no term); under "all", everything.
export const pointsInTerm = <T extends { courseId: string | null }>(points: T[], termOf: Map<string, string | null>, term: TermChoice) =>
  term === "all" ? points : points.filter((point) => point.courseId !== null && termOf.has(point.courseId) && inTerm(term, termOf.get(point.courseId)));

const shorten =(text: string, length: number) => text.length > length ? `${text.slice(0, length - 1).replace(/\s+\S*$/, "")}…` : text;

// Imported wording that only makes sense to the importer, said plainly.
export const plain = (text: string) => text
  .replace(/\(\s*cut off on the page\s*\)/gi, "(the rest of this comment was not shown on the Feedback page)")
  .replace(/\bnot_submitted\b/g, "not submitted");
