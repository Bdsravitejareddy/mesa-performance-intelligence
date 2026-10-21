// Deterministic extraction of criterion marks written into official feedback, e.g.
// "Problem & validation 3/5 | Customer, market & competition 2/5 | MVP concept 3/5".
// The source text is never altered; anything ambiguous is left unparsed.

export type CriterionScore = { label: string; score: number; max: number; percent: number };

const SEGMENT = /([A-Za-z][A-Za-z0-9&,'’()\- ]{1,80}?)\s*[:\-–]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*\/\s*(\d{1,3}(?:\.\d{1,2})?)(?![\d/])/g;
// Overall totals, dates and question numbers are not criteria.
const EXCLUDED_LABEL = /^(total|overall|final|grand total|score|marks?|mark|result|q\d+|question \d+)$/i;
const MIN_CRITERIA = 2;

export function parseCriterionScores(feedback: string): CriterionScore[] {
  if (!feedback.trim()) return [];
  const found: CriterionScore[] = [];
  const seen = new Set<string>();
  for (const match of feedback.matchAll(SEGMENT)) {
    const label = cleanLabel(match[1]);
    const score = Number(match[2]);
    const max = Number(match[3]);
    if (!label || EXCLUDED_LABEL.test(label) || !(max > 0) || score < 0 || score > max) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ label, score, max, percent: Math.round((score / max) * 1000) / 10 });
  }
  // A single "x/y" in prose is too weak to treat as a rubric breakdown.
  return found.length >= MIN_CRITERIA ? found : [];
}

function cleanLabel(raw: string): string {
  // Keep only the text after the last separator so "...early doct | MVP concept" yields "MVP concept".
  const tail = raw.split(/[|;•\n]/).at(-1) ?? "";
  return tail.replace(/^[\s,.:\-–]+|[\s,.:\-–]+$/g, "").replace(/\s+/g, " ").slice(0, 80);
}

export type CriterionGap = CriterionScore & { overall: number };

// Criteria scoring below the low band while the overall mark is not low: a topic-level gap a single mark hides.
export function hiddenCriterionGaps(criteria: CriterionScore[], overall: number | null, lowBand = 65): CriterionGap[] {
  if (overall === null || overall < lowBand) return [];
  return criteria.filter((criterion) => criterion.percent < lowBand).map((criterion) => ({ ...criterion, overall }));
}
