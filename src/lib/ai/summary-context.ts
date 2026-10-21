import { createHash } from "node:crypto";

export type InsightSourceRecord =
  | { kind: "mark"; id: string; label: string; score: number | null; maximum: number; feedback: string; course: string }
  | { kind: "evaluation"; id: string; label: string; summary: unknown; sourceReferences: { key: string; label: string }[]; course: string };

export type InsightSummaryContext = {
  context: string;
  sources: { key: string; label: string; kind: "mark" | "feedback" | "evaluation" }[];
  sampleCounts: { marks: number; feedback: number; evaluations: number };
};

export function createInsightSummaryInputHash(context: InsightSummaryContext, providerModel: string, disclosureVersion: string): string {
  return createHash("sha256").update(JSON.stringify({ disclosure: disclosureVersion, providerModel, context: context.context, sources: context.sources, sampleCounts: context.sampleCounts })).digest("hex");
}

const clean = (value: string, limit: number) => value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);

export function buildInsightSummaryContext(records: InsightSourceRecord[]): InsightSummaryContext {
  const sources: InsightSummaryContext["sources"] = [];
  const lines: string[] = [];
  let markCount = 0;
  let feedbackCount = 0;
  let evaluationCount = 0;
  for (const record of records.slice(0, 100)) {
    if (record.kind === "mark") {
      if (!Number.isFinite(record.maximum) || record.maximum <= 0 || (record.score !== null && (!Number.isFinite(record.score) || record.score < 0 || record.score > record.maximum))) continue;
      const label = clean(record.label, 160);
      const course = clean(record.course, 120);
      if (record.score !== null) {
        const key = `M${++markCount}`;
        sources.push({ key, label, kind: "mark" });
        lines.push(`[${key}] Official result: ${course} · ${label}: ${record.score}/${record.maximum}.`);
      }
      const feedback = clean(record.feedback, 1000);
      if (feedback) {
        const feedbackKey = `F${++feedbackCount}`;
        sources.push({ key: feedbackKey, label: `${label} official feedback`, kind: "feedback" });
        lines.push(`[${feedbackKey}] Official evaluator feedback: ${feedback}`);
      }
    } else if (record.kind === "evaluation") {
      const label = clean(record.label, 160);
      const course = clean(record.course, 120);
      const evaluation = record.summary && typeof record.summary === "object" ? record.summary as Record<string, unknown> : {};
      const verifiedKeys = new Set(record.sourceReferences.map((reference) => reference.key));
      const entries = ["strengths", "improvements", "actions"].flatMap((section) => Array.isArray(evaluation[section]) ? (evaluation[section] as unknown[]).slice(0, 4) : []);
      const statements = entries.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        return typeof item.detail === "string" && typeof item.title === "string" && Array.isArray(item.sourceRefs) && item.sourceRefs.length && item.sourceRefs.every((key) => typeof key === "string" && verifiedKeys.has(key)) ? [`${clean(item.title, 120)}: ${clean(item.detail, 500)}`] : [];
      }).slice(0, 8);
      if (!statements.length) continue;
      const key = `E${++evaluationCount}`;
      sources.push({ key, label, kind: "evaluation" });
      const citedKeys = new Set<string>();
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const sourceRefs = (entry as Record<string, unknown>).sourceRefs;
        if (!Array.isArray(sourceRefs)) continue;
        for (const sourceKey of sourceRefs) if (typeof sourceKey === "string" && verifiedKeys.has(sourceKey)) citedKeys.add(sourceKey);
      }
      const references = [...citedKeys].map((sourceKey) => record.sourceReferences.find((reference) => reference.key === sourceKey)?.label).filter((reference): reference is string => Boolean(reference));
      lines.push(`[${key}] Saved evidence-linked assessment analysis for ${course} · ${label}, supported by ${references.map((reference) => clean(reference, 180)).join(", ")}: ${statements.join("; ")}`);
    }
  }
  return {
    context: lines.length ? lines.join("\n").slice(0, 16_000) : "No eligible evidence is available. Do not make performance claims; use insufficient confidence and explain the evidence gap.",
    sources,
    sampleCounts: { marks: markCount, feedback: feedbackCount, evaluations: evaluationCount },
  };
}
