import { verifyArithmeticStatements } from "./scoring";

export type QualityFinding = { title: string; detail: string; level: "check" | "strength" };

export function inspectSubmissionQuality(text: string): {
  wordCount: number;
  findings: QualityFinding[];
  scopeNote: string;
} {
  const content = text.trim();
  const words = content.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  const findings: QualityFinding[] = [];
  const headings = content.split("\n").filter((line) => /^\s{0,3}(#{1,6}\s|\d+\.)/.test(line));
  const arithmetic = verifyArithmeticStatements(content);
  const referencesHeading = /(^|\n)\s*(references|bibliography|sources)\s*:?(\n|$)/i.test(content);
  const sourceMarkers = /\[[0-9]+\]|\([A-Z][A-Za-z-]+,?\s+\d{4}\)|https?:\/\//.test(content);

  if (words.length < 80) findings.push({ title: "Short response", detail: `The draft has ${words.length} words. Check the assignment's required length before submitting.`, level: "check" });
  if (headings.length > 0) findings.push({ title: "Section structure found", detail: `${headings.length} numbered or Markdown heading${headings.length === 1 ? "" : "s"} detected.`, level: "strength" });
  else findings.push({ title: "No section headings detected", detail: "The text has no numbered or Markdown headings. Compare its structure with the assignment requirements.", level: "check" });
  if (referencesHeading || sourceMarkers) findings.push({ title: "Source markers found", detail: referencesHeading ? "A references or sources section is present; citation accuracy has not been verified." : "Citation-like markers are present; source accuracy has not been verified.", level: "strength" });
  else findings.push({ title: "No source markers found", detail: "No references section or common citation markers were detected. This does not prove that claims are unsupported.", level: "check" });
  for (const item of arithmetic) {
    findings.push(item.status === "arithmetic_error"
      ? { title: "Arithmetic mismatch", detail: `${item.expression} gives ${item.computed}, while the text reports ${item.reported}. Formula choice and units still need human review.`, level: "check" }
      : { title: "Arithmetic expression checked", detail: `${item.expression} is arithmetically consistent. Method selection and interpretation were not checked.`, level: "strength" });
  }

  return {
    wordCount: words.length,
    findings,
    scopeNote: "This local checker verifies only observable formatting signals and simple arithmetic. It cannot judge whether claims are true, evidence is sufficient, or reasoning meets the rubric.",
  };
}
