// Project evaluations read documentation and file structure only, so claims of verification are rewritten to
// what the evidence supports. Applied when an evaluation is saved and again when it is shown.
const RULES: [RegExp, string | ((match: string, ...groups: string[]) => string)][] = [
  // One pass handles the article; already softened text is left alone, so applying twice changes nothing.
  [/\b(?:(a|an) )?(?<!apparently )complete end-to-end implementation\b(?! \(from the structure)/gi, (_m: string, article?: string) => `${article ? "an " : ""}apparently complete end-to-end implementation (from the structure; not run)`],
  [/\bfully (implemented|working|functional)\b/gi, "described as $1"],
  [/\b(rigorous|robust|comprehensive) (evaluation|test(ing)?) suites?\b/gi, "documented $2 setup"],
  [/\bRigorous\b/g, "Detailed"],
  [/\brigorous\b/g, "detailed"],
  [/\b(is|are|was|were) (verified|validated|proven)\b/gi, "$1 described"],
  [/\bproduction-ready\b/gi, "apparently well-developed"],
];
export function soften(text: string): string {
  return RULES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement as string), text);
}
export function softenReport<T extends { summary?: string; strengths?: string[]; issues?: string[]; dimensions?: { strength?: string; issue?: string }[] }>(report: T): T {
  return { ...report, summary: report.summary ? soften(report.summary) : report.summary, strengths: report.strengths?.map(soften), issues: report.issues?.map(soften), dimensions: report.dimensions?.map((dimension) => ({ ...dimension, strength: dimension.strength ? soften(dimension.strength) : dimension.strength, issue: dimension.issue ? soften(dimension.issue) : dimension.issue })) };
}
