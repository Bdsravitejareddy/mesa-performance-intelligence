import type { CodeReport } from "./code-score";
import type { BlindReport } from "@/lib/quality/engine";

// Why the views disagree, in plain language. Deterministic wording from the figures; it explains what each
// view measures and never says which one is right.
export function differenceReasons(code: CodeReport, ai: BlindReport | null, scores: { ai: number | null; code: number | null; official: number | null }, facultyOnly: number): string[] {
  const reasons: string[] = [];
  const parts = code.parts ?? [];
  if (code.completeness !== null && code.completeness !== undefined && parts.length) {
    const missing = parts.filter((part) => !part.answered).map((part) => part.label);
    const tasks = parts[0]?.label.startsWith("Task") ? "tasks" : "questions";
    reasons.push(missing.length
      ? `The code check looks for an answer to each of the brief's ${parts.length} ${tasks} and found ${parts.length - missing.length}; it couldn't find ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " and others" : ""}. It only checks that each one was attempted, not how well.`
      : `The code check found an answer to every one of the brief's ${parts.length} ${tasks}. It only checks that each was attempted, not how well.`);
    if (scores.ai !== null && Math.abs(scores.ai - code.completeness) >= 15) {
      reasons.push(scores.ai > code.completeness
        ? "The AI rated the answers it read higher than the share of questions the check could find. That usually means some answers are there but not labelled or worded the way the brief numbers them — so the code score is likely too low, not the AI's too high."
        : `You attempted nearly everything, but the AI found problems in how it was answered${ai?.issues[0] ? ` — chiefly: ${ai.issues[0].replace(/\.$/, "")}.` : "."} That is the gap: attempting a question earns the code check's credit, answering it well earns the AI's.`);
    }
  } else if (scores.code === null && scores.ai !== null) {
    reasons.push("This brief doesn't list separate questions or tasks, so the code check has nothing to tick off and gives no score. Only the AI's judgement applies.");
  }
  if (scores.official !== null && scores.ai !== null && Math.abs(scores.official - scores.ai) >= 10) {
    const gap = Math.abs(Math.round((scores.official - scores.ai) * 10) / 10);
    reasons.push(`Your official mark is ${gap} points ${scores.official > scores.ai ? "higher" : "lower"} than the AI's.${facultyOnly ? ` The faculty mentioned ${facultyOnly} thing${facultyOnly === 1 ? "" : "s"} the AI didn't, which may explain part of it.` : ""} The faculty may also use a different rubric or weighting than the AI, which worked from the brief.`);
  }
  if (code.wordCount < 150) reasons.push(`Only ${code.wordCount} words of readable text came through. Slides, images and charts aren't read, so both checks saw less of your work than the faculty did.`);
  return reasons.slice(0, 6);
}
