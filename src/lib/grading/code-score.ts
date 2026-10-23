import { verifyArithmeticStatements, type ArithmeticCheck } from "@/lib/scoring";

// A deterministic score: how much of each rubric criterion and of the relevant course material the work
// addresses. It measures coverage, not quality or correctness of reasoning; the same work always gets the
// same score, and every point can be traced to a matched term.
export const CODE_RULES_VERSION = "code-completeness-v5";
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
export type BriefPart = { label: string; text: string; keywords: string[]; answered: boolean; how: "label" | "keywords" | "formula" | "missing" };
export type CodeReport = {
  rulesVersion: string;
  parts?: BriefPart[];
  completeness?: number | null;
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

// ── Completeness (v2) ────────────────────────────────────────────────────────────────────────────────
// The questions and parts the brief asks for ("Q1", "1.", "Part A", "A2", "(b)") are read from its text, and
// each counts as answered when the work labels it the same way or contains most of its distinctive words.
// This measures whether everything asked was attempted — not whether the answers are right.
const PART = /^\s*(?:(Q(?:uestion)?\s*\d+[a-z]?)|(Part\s+[A-Z0-9]+)|([A-Z]\d{1,2})|(\d{1,2})[.)]|\(([a-z])\))[\s:.)\-–]+(.{8,240})$/im;

export function briefParts(brief: string): { label: string; text: string; keywords: string[] }[] {
  const parts: { label: string; text: string; keywords: string[] }[] = [];
  for (const line of brief.split(/\n+/)) {
    const match = PART.exec(line);
    if (!match) continue;
    const label = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "").replace(/\s+/g, " ").trim();
    const text = match[6].trim();
    if (!label || parts.some((part) => part.label.toLowerCase() === label.toLowerCase())) continue;
    parts.push({ label, text, keywords: keyTerms(text, 6) });
    if (parts.length >= 20) break;
  }
  if (parts.length >= 2) return parts;
  // Briefs written as bullets or instructions ("Identify three metrics…") have no numbers: each task line is a part.
  const tasks: { label: string; text: string; keywords: string[] }[] = [];
  for (const line of brief.split(/\n+/)) {
    const text = line.replace(/^\s*(?:[-•*▪●◦]|\d+[.)])\s*/, "").trim();
    const bullet = text !== line.trim();
    if (text.length < 15 || text.length > 300 || LOGISTICS.test(text)) continue;
    if (!bullet && !TASK_VERB.test(text)) continue;
    const keywords = keyTerms(text, 6);
    if (keywords.length < 2) continue;
    tasks.push({ label: `Task ${tasks.length + 1}`, text, keywords });
    if (tasks.length >= 12) break;
  }
  return tasks.length >= 2 ? tasks : parts;
}
const TASK_VERB = /^(identify|explain|analy[sz]e|describe|calculate|compute|compare|recommend|choose|select|list|create|build|prepare|map|apply|evaluate|assess|discuss|justify|propose|define|outline|draw|design|estimate|summari[sz]e|suggest|present|develop|construct|rank|prioriti[sz]e|interpret|reflect|use)\b/i;
const LOGISTICS = /\b(submit|upload|deadline|due|file ?name|naming|word limit|font|pdf|docx|plagiaris|late submission|turnitin|format of)\b/i;

function labelPattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  const numeric = /^\d+$/.test(label) ? `(?:Q(?:uestion)?\\s*)?${escaped}[.):]` : /^[a-z]$/.test(label) ? `\\(${escaped}\\)` : escaped;
  return new RegExp(`(^|[^A-Za-z0-9])${numeric}(?![0-9])`, "im");
}

// Spreadsheet functions a brief can ask for by name. A part that names functions counts as answered when the
// submitted workbook's formulas use them, even if the answer sits on an unlabelled or merged sheet.
const SHEET_FUNCTIONS = new Set(("LEFT MID RIGHT LEN FIND SEARCH SPLIT TEXTSPLIT TEXTBEFORE TEXTAFTER SUBSTITUTE REPLACE TRIM CLEAN UPPER LOWER PROPER VALUE TEXT TEXTJOIN CONCAT CONCATENATE "
  + "SUM SUMIF SUMIFS SUMPRODUCT AVERAGE AVERAGEIF AVERAGEIFS COUNT COUNTA COUNTIF COUNTIFS MIN MAX MINIFS MAXIFS MEDIAN ROUND ROUNDUP ROUNDDOWN IF IFS IFERROR "
  + "VLOOKUP HLOOKUP XLOOKUP INDEX MATCH XMATCH FILTER SORT SORTBY UNIQUE OFFSET INDIRECT CHOOSE SWITCH LET DATE DATEDIF EOMONTH YEAR MONTH DAY WEEKDAY NETWORKDAYS TODAY "
  + "ISNUMBER ISBLANK ISTEXT ISERROR RANK PERCENTILE QUARTILE STDEV CORREL FORECAST TREND NPV IRR PMT FV PV QUERY ARRAYFORMULA REGEXMATCH REGEXEXTRACT REGEXREPLACE").split(" "));
const namedFunctions = (text: string) => [...new Set([...text.matchAll(/\b([A-Z][A-Z0-9.]{1,14})\b/g)].map((match) => match[1]).filter((name) => SHEET_FUNCTIONS.has(name)))];
export function formulaFunctions(work: string): Set<string> {
  const used = new Set<string>();
  for (const match of work.matchAll(/\b([A-Z][A-Z0-9.]*)\(/g)) used.add(match[1].replace(/^_xlfn\./, ""));
  for (const line of work.matchAll(/^Formulas used: (.+)$/gm)) for (const name of line[1].replace(/\(.*$/, "").split(/,\s*/)) if (name && name !== "none") used.add(name.trim());
  return used;
}

export function completeness(work: string, brief: string): { score: number | null; parts: BriefPart[] } {
  const found = briefParts(brief);
  if (found.length < 2) return { score: null, parts: [] };
  const used = formulaFunctions(work);
  // Formula lines hold cell references such as Q1, which must not be read as answer labels.
  work = work.replace(/^Formula .*$/gm, "");
  const present = new Set(terms(work));
  const parts: BriefPart[] = found.map((part) => {
    if (labelPattern(part.label).test(work)) return { ...part, answered: true, how: "label" };
    const named = namedFunctions(`${part.label} ${part.text}`);
    if (named.length && named.filter((name) => used.has(name)).length >= Math.ceil(named.length / 2)) return { ...part, answered: true, how: "formula" };
    const hits = part.keywords.filter((term) => present.has(term)).length;
    const answered = part.keywords.length > 0 && hits >= Math.max(2, Math.ceil(part.keywords.length * 0.5));
    return { ...part, answered, how: answered ? "keywords" : "missing" };
  });
  return { score: Math.round((parts.filter((part) => part.answered).length / parts.length) * 1000) / 10, parts };
}

// The code score: completeness against the brief's parts when the brief lists them (75%), with criterion
// coverage (25%); otherwise criterion coverage alone. Arithmetic errors and very short work still adjust it.
export function codeGradeV2(work: string, criteria: CriterionInput[], courseExcerpts: string[], brief: string): { score: number | null; report: CodeReport } {
  const base = codeGrade(work, criteria, courseExcerpts);
  const check = completeness(work, brief);
  // Without tasks to tick off there is nothing objective to check: word overlap with the criteria says little
  // about the work, so no code score is given and only the AI's judgement applies.
  if (check.score === null || base.score === null) {
    return { score: null, report: { ...base.report, rulesVersion: CODE_RULES_VERSION, parts: [], completeness: null, method: "The brief doesn't list separate questions or tasks, so the code check has nothing to tick off and gives no score. Only the AI's judgement applies here." } };
  }
  let score = 0.75 * check.score + 0.25 * base.score;
  const adjustments = [...base.report.adjustments];
  if (base.report.arithmetic.errors.length) score -= Math.min(10, base.report.arithmetic.errors.length * 2);
  if (base.report.wordCount < MIN_WORDS) score = Math.min(score, 50);
  return {
    score: round1(Math.max(0, Math.min(100, score))),
    report: { ...base.report, rulesVersion: CODE_RULES_VERSION, parts: check.parts, completeness: check.score, adjustments,
      method: `The code check ticks off what the brief asks for: ${check.parts.filter((part) => part.answered).length} of ${check.parts.length} questions or tasks were found answered — by their label, by using the spreadsheet functions they name, or by covering most of their key words. That makes up 75% of its score; the other 25% is how much of each criterion's key vocabulary appears. It checks that everything was attempted, not whether the answers are right — that is what the AI and your faculty judge.` },
  };
}
