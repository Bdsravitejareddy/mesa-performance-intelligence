import { createHash } from "node:crypto";

export type InsightSourceRecord =
  | { kind: "mark"; id: string; label: string; score: number | null; maximum: number; feedback: string; course: string }
  | { kind: "evaluation"; id: string; label: string; summary: unknown; sourceReferences: { key: string; label: string }[]; course: string; scores?: { mesaAcademic: number | null; analytical: number | null; professional: number | null }; status?: string; evidence?: { id: string; layer: string; criterion: string; finding: string; confidence: string; sourceReference: string; submissionQuote: string }[] };

export type InsightSummaryContext = {
  context: string;
  sources: { key: string; label: string; kind: "mark" | "feedback" | "evaluation" }[];
  sampleCounts: { marks: number; feedback: number; evaluations: number };
  evidenceFingerprint: string;
};

export function createInsightSummaryInputHash(context: InsightSummaryContext, providerModel: string, disclosureVersion: string, configurationFingerprint: string): string {
  return createHash("sha256").update(JSON.stringify({ disclosure: disclosureVersion, providerModel, configurationFingerprint, context: context.context, sources: context.sources, sampleCounts: context.sampleCounts, evidenceFingerprint: context.evidenceFingerprint })).digest("hex");
}

const clean = (value: string, limit: number) => value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);

export function buildInsightSummaryContext(records: InsightSourceRecord[]): InsightSummaryContext {
  const sources: InsightSummaryContext["sources"] = [];
  const lines: string[] = [];
  const maximumCharacters = 16_000;
  let usedCharacters = 0;
  let markCount = 0;
  let feedbackCount = 0;
  let evaluationCount = 0;
  let budgetReached = false;
  const evidenceFingerprint = createHash("sha256").update(JSON.stringify(records.filter((record): record is Extract<InsightSourceRecord, { kind: "evaluation" }> => record.kind === "evaluation").map((record) => ({ id: record.id, scores: record.scores, status: record.status, evidence: record.evidence, sourceReferences: record.sourceReferences, summary: record.summary })))).digest("hex");
  const append = (key: string, label: string, kind: InsightSummaryContext["sources"][number]["kind"], line: string) => {
    const safeLine = line.slice(0, maximumCharacters);
    const added = safeLine.length + (lines.length ? 1 : 0);
    if (usedCharacters + added > maximumCharacters) { budgetReached = true; return false; }
    sources.push({ key, label, kind });
    lines.push(safeLine);
    usedCharacters += added;
    return true;
  };
  const marks = records.filter((record): record is Extract<InsightSourceRecord, { kind: "mark" }> => record.kind === "mark").slice(0, 100);
  const evaluations = records.filter((record): record is Extract<InsightSourceRecord, { kind: "evaluation" }> => record.kind === "evaluation").slice(0, 100);
  for (let index = 0; index < Math.max(marks.length, evaluations.length) && !budgetReached; index += 1) {
    const mark = marks[index];
    if (mark && Number.isFinite(mark.maximum) && mark.maximum > 0 && (mark.score === null || (Number.isFinite(mark.score) && mark.score >= 0 && mark.score <= mark.maximum))) {
      const label = clean(mark.label, 160);
      const course = clean(mark.course, 120);
      if (mark.score !== null && !append(`M${markCount + 1}`, label, "mark", `Official submission ${clean(mark.id, 80)} result: ${course} · ${label}: ${mark.score}/${mark.maximum}.`)) break;
      if (mark.score !== null) markCount += 1;
      const feedback = clean(mark.feedback, 350);
      if (feedback) {
        if (!append(`F${feedbackCount + 1}`, `${label} official feedback`, "feedback", `Official evaluator feedback: ${feedback}`)) break;
        feedbackCount += 1;
      }
    }
    const record = evaluations[index];
    if (!record) continue;
    const label = clean(record.label, 160);
    const course = clean(record.course, 120);
    const evaluation = record.summary && typeof record.summary === "object" ? record.summary as Record<string, unknown> : {};
    const verifiedKeys = new Set(record.sourceReferences.map((reference) => reference.key));
    const entries = ["strengths", "improvements", "actions"].flatMap((section) => Array.isArray(evaluation[section]) ? (evaluation[section] as unknown[]).slice(0, 4) : []);
    const statements = entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      return typeof item.detail === "string" && typeof item.title === "string" && Array.isArray(item.sourceRefs) && item.sourceRefs.length && item.sourceRefs.every((sourceKey) => typeof sourceKey === "string" && verifiedKeys.has(sourceKey)) ? [`${clean(item.title, 100)}: ${clean(item.detail, 260)}`] : [];
    }).slice(0, 3);
    if (!statements.length && !record.evidence?.length && !record.scores) continue;
    const key = `E${evaluationCount + 1}`;
    const citedKeys = new Set<string>();
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const sourceRefs = (entry as Record<string, unknown>).sourceRefs;
      if (!Array.isArray(sourceRefs)) continue;
      for (const sourceKey of sourceRefs) if (typeof sourceKey === "string" && verifiedKeys.has(sourceKey)) citedKeys.add(sourceKey);
    }
    const references = [...citedKeys].map((sourceKey) => record.sourceReferences.find((reference) => reference.key === sourceKey)?.label).filter((reference): reference is string => Boolean(reference));
    const scoreText = record.scores ? `; scores Mesa academic=${record.scores.mesaAcademic ?? "insufficient"}, analytical=${record.scores.analytical ?? "insufficient"}, professional=${record.scores.professional ?? "insufficient"}; status=${clean(record.status ?? "unknown", 40)}` : "";
    const evidenceText = (record.evidence ?? []).slice(0, 6).map((item) => `evidence ${clean(item.id, 80)} ${clean(item.layer, 40)} ${clean(item.criterion, 120)}: ${clean(item.finding, 220)} (${clean(item.confidence, 30)}; ${clean(item.sourceReference, 180)}; submission excerpt ${clean(item.submissionQuote, 180)})`).join("; ");
    const sourceText = references.length ? `, supported by ${references.slice(0, 3).map((reference) => clean(reference, 160)).join(", ")}` : "";
    const line = `Saved evaluation report ${clean(record.id, 80)} for ${course} · ${label}${scoreText}${evidenceText ? `; ${evidenceText}` : ""}${sourceText}${statements.length ? `; findings: ${statements.join("; ")}` : ""}`;
    if (append(key, label, "evaluation", line)) evaluationCount += 1;
  }
  return {
    context: lines.length ? lines.join("\n") : "No eligible evidence is available. Do not make performance claims; use insufficient confidence and explain the evidence gap.",
    sources,
    sampleCounts: { marks: markCount, feedback: feedbackCount, evaluations: evaluationCount },
    evidenceFingerprint,
  };
}
