import { verifyArithmeticStatements, type ArithmeticCheck } from "@/lib/scoring";

// A deterministic score: how much of each rubric criterion and of the relevant course material the work
// addresses. It measures coverage, not quality or correctness of reasoning; the same work always gets the
// same score, and every point can be traced to a matched term.
export const CODE_RULES_VERSION = "code-coverage-v1";
export const FULL_COVERAGE = 0.6; // a criterion counts as fully addressed when 60% of its key terms appear
const RUBRIC_SHARE = 0.8;
const COURSE_SHARE = 0.2;
const MIN_WORDS = 150;

const STOP = new Set(("a an the and or but if then than of to in on at by for with from into onto over under about as is are was were be been being it its this that these those there their they them we our you your he she his her i me my "
  + "do does did done can could should would will shall may might must not no nor so such very also just only both each any all more most less least other some many much few "
  + "what which who whom whose when where why how while within without between across through during before after above below up down out off again further once here "
  + "use used using uses make makes made include includes including included provide provides provided show shows shown demonstrate demonstrates demonstrated demonstrating "
  + "student students work answer answers response responses submission assessment assignment task question questions criterion criteria rubric marks mark score scores "
  + "clear clearly effective effectively appropriate appropriately relevant relevance good strong well quality level ability able understanding understand overall "
  + "key main general specific specifically various different example examples way ways part parts point points etc e g ie eg one two three first second third new").split(" "));

// Light suffix stripping so "pricing", "priced" and "prices" meet at "pric".
export function stem(word: string): string {
  if (word.length <= 4) return word;
  for (const suffix of ["ations", "ation", "ments", "ment", "ities", "ity", "ings", "ing", "ies", "ers", "er", "ed", "es", "ly", "s"]) {
    if (suffix === "s" && /(ss|is|us)$/.test(word)) continue;
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return suffix === "ies" ? `${word.slice(0, -3)}y` : word.slice(0, -suffix.length);
  }
  return word;
}

export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []).map((word) => word.replace(/-/g, "")).filter((word) => word.length >= 3 && !STOP.has(word)).map(stem);
}

// Most frequent distinct terms, ties broken by first appearance.
export function keyTerms(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const term of terms(text)) counts.set(term, (counts.get(term) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([term]) => term);
}

export type CriterionInput = { name: string; description: string; weight: number };
export type CriterionCoverage = { name: string; weight: number; expected: string[]; matched: string[]; coverage: number; score: number };
export type CodeReport = {
  rulesVersion: string;
  criteria: CriterionCoverage[];
  courseConcepts: { expected: string[]; matched: string[]; coverage: number };
  wordCount: number;
  arithmetic: { checked: number; errors: ArithmeticCheck[] };
  adjustments: string[];
  method: string;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

export function codeGrade(work: string, criteria: CriterionInput[], courseExcerpts: string[]): { score: number | null; report: CodeReport } {
  const present = new Set(terms(work));
  const wordCount = (work.match(/\S+/g) ?? []).length;
  const covered = (expected: string[]) => expected.filter((term) => present.has(term));
  const rows: CriterionCoverage[] = criteria.map((criterion) => {
    const expected = keyTerms(`${criterion.name} ${criterion.name} ${criterion.description}`, 12);
    const matched = covered(expected);
    const coverage = expected.length ? matched.length / expected.length : 0;
    return { name: criterion.name, weight: criterion.weight > 0 ? criterion.weight : 1, expected, matched, coverage: round1(coverage * 100) / 100, score: round1(Math.min(1, coverage / FULL_COVERAGE) * 10) };
  });
  const courseExpected = keyTerms(courseExcerpts.join("\n"), 24);
  const courseMatched = covered(courseExpected);
  const courseCoverage = courseExpected.length ? courseMatched.length / courseExpected.length : 0;
  const arithmetic = verifyArithmeticStatements(work);
  const errors = arithmetic.filter((check) => check.status === "arithmetic_error");
  const adjustments: string[] = [];
  const report: CodeReport = {
    rulesVersion: CODE_RULES_VERSION,
    criteria: rows,
    courseConcepts: { expected: courseExpected, matched: courseMatched, coverage: Math.round(courseCoverage * 100) / 100 },
    wordCount,
    arithmetic: { checked: arithmetic.length, errors },
    adjustments,
    method: `Each criterion scores 10 when at least ${FULL_COVERAGE * 100}% of its key terms appear in the work (proportionally less below that). The total is ${RUBRIC_SHARE * 100}% weighted criterion coverage and ${COURSE_SHARE * 100}% coverage of the course material's key concepts, minus 2 points per arithmetic error. It measures what the work addresses, not how well it argues.`,
  };
  const scorable = rows.filter((row) => row.expected.length);
  if (!scorable.length || !wordCount) return { score: null, report };
  const totalWeight = scorable.reduce((sum, row) => sum + row.weight, 0);
  const rubricPart = scorable.reduce((sum, row) => sum + (row.score / 10) * row.weight, 0) / totalWeight;
  const coursePart = courseExpected.length ? Math.min(1, courseCoverage / FULL_COVERAGE) : rubricPart;
  let score = (RUBRIC_SHARE * rubricPart + COURSE_SHARE * coursePart) * 100;
  if (errors.length) { score -= Math.min(10, errors.length * 2); adjustments.push(`${errors.length} arithmetic error${errors.length === 1 ? "" : "s"}: −${Math.min(10, errors.length * 2)}`); }
  if (wordCount < MIN_WORDS) { score = Math.min(score, 50); adjustments.push(`Only ${wordCount} words of readable text: capped at 50`); }
  return { score: round1(Math.max(0, Math.min(100, score))), report };
}
