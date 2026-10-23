// How much an assessment counted, read from its title. Effort and quality are typically lower on ungraded
// practice than on term exams, so practice work is weighted lightly and never decides a conclusion on its own
// when graded work exists. Deterministic; unmatched titles count as graded work.
export type Stakes = "exam" | "graded" | "practice";
export const STAKES_WEIGHT: Record<Stakes, number> = { exam: 3, graded: 2, practice: 1 };
export const STAKES_LABEL: Record<Stakes, string> = { exam: "Term exam", graded: "Graded work", practice: "Practice" };

const EXAM = /\b(mid[\s-]?term|end[\s-]?term|final|graded submission|written assessment|assessment\s*(form\s*)?\d|mrs\b)/i;
const PRACTICE = /\b(async|workbook|practice|reflection|recording|template|week\s*\d|session\s*\d|live .*writing)/i;

export function stakesOf(title: string): Stakes {
  if (EXAM.test(title)) return "exam";
  if (PRACTICE.test(title)) return "practice";
  return "graded";
}
