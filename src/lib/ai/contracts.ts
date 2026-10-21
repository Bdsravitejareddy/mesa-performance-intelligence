export type DraftCriterion = { title: string; description: string; weight: number; maximumMarks: number; sourceRefs: string[] };
export type RubricDraft = { criteria: DraftCriterion[] };
export type EvaluationFinding = { criterion: string; finding: string; quote: string; sourceRefs: string[]; confidence: "high" | "medium" | "low" | "insufficient" };
export type EvaluationLayer = { score: number | null; findings: EvaluationFinding[] };
export type SummaryConfidence = "high" | "medium" | "low" | "insufficient";
export type SummaryItem = { title: string; detail: string; sourceRefs: string[]; confidence: SummaryConfidence };
export type ImprovementItem = SummaryItem & { whatStudentDid: string; courseExpectation: string; whyIncomplete: string; illustrativeExample: string; rubricAlignment: string; professionalApplication: string };
export type EvaluationSummary = { strengths: SummaryItem[]; improvements: ImprovementItem[]; actions: SummaryItem[] };
export type EvaluationPayload = {
  mesaAcademic: EvaluationLayer;
  analytical: EvaluationLayer;
  professional: EvaluationLayer;
  reconciliation: { criterion: string; officialEvidence: string; analysis: string; confidence: "high" | "medium" | "low" | "insufficient" }[];
  summary: EvaluationSummary;
};

export function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export function validateRubricDraft(value: unknown, maximumMarks: number): RubricDraft | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { criteria?: unknown }).criteria)) return null;
  const criteria = (value as { criteria: unknown[] }).criteria;
  if (criteria.length < 2 || criteria.length > 12) return null;
  const parsed: DraftCriterion[] = [];
  for (const raw of criteria) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.title !== "string" || !item.title.trim() || typeof item.description !== "string" || !Array.isArray(item.sourceRefs)) return null;
    if (!Number.isFinite(item.weight) || !Number.isFinite(item.maximumMarks) || Number(item.weight) <= 0 || Number(item.maximumMarks) <= 0) return null;
    const sourceRefs = item.sourceRefs.filter((ref): ref is string => typeof ref === "string");
    if (!sourceRefs.length) return null;
    parsed.push({ title: item.title.trim().slice(0, 160), description: item.description.trim().slice(0, 2000), weight: Number(item.weight), maximumMarks: Number(item.maximumMarks), sourceRefs });
  }
  const weightSum = parsed.reduce((sum, item) => sum + item.weight, 0);
  const markSum = parsed.reduce((sum, item) => sum + item.maximumMarks, 0);
  if (Math.abs(weightSum - 100) > 0.05 || Math.abs(markSum - maximumMarks) > 0.05) return null;
  return { criteria: parsed };
}

export function validateInsightSummary(value: unknown, validReferences: Set<string>): EvaluationSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const summaryItem = (candidate: unknown, improvement = false): SummaryItem | ImprovementItem | null => {
    if (!candidate || typeof candidate !== "object") return null;
    const item = candidate as Record<string, unknown>;
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 180 || typeof item.detail !== "string" || !item.detail.trim() || item.detail.length > 1800 || !Array.isArray(item.sourceRefs) || item.sourceRefs.length > 20 || item.sourceRefs.some((ref) => typeof ref !== "string") || !["high", "medium", "low", "insufficient"].includes(String(item.confidence))) return null;
    const sourceRefs = item.sourceRefs as string[];
    if (sourceRefs.some((ref) => !validReferences.has(ref)) || (item.confidence !== "insufficient" && sourceRefs.length === 0)) return null;
    const base: SummaryItem = { title: item.title.trim(), detail: item.detail.trim(), sourceRefs, confidence: item.confidence as SummaryConfidence };
    if (!improvement) return base;
    const fields = ["whatStudentDid", "courseExpectation", "whyIncomplete", "illustrativeExample", "rubricAlignment", "professionalApplication"] as const;
    if (fields.some((field) => typeof item[field] !== "string" || !(item[field] as string).trim() || (item[field] as string).length > 1800)) return null;
    if (!(item.illustrativeExample as string).toLocaleLowerCase().includes("illustrative")) return null;
    return { ...base, whatStudentDid: item.whatStudentDid as string, courseExpectation: item.courseExpectation as string, whyIncomplete: item.whyIncomplete as string, illustrativeExample: item.illustrativeExample as string, rubricAlignment: item.rubricAlignment as string, professionalApplication: item.professionalApplication as string };
  };
  const result: { strengths: SummaryItem[]; improvements: ImprovementItem[]; actions: SummaryItem[] } = { strengths: [], improvements: [], actions: [] };
  for (const section of ["strengths", "improvements", "actions"] as const) {
    const entries = raw[section];
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 8) return null;
    for (const entry of entries) {
      const parsed = summaryItem(entry, section === "improvements");
      if (!parsed) return null;
      (result[section] as (SummaryItem | ImprovementItem)[]).push(parsed);
    }
  }
  return result;
}

export function validateEvaluation(value: unknown, validReferences: Set<string>): EvaluationPayload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const layer = (candidate: unknown): EvaluationLayer | null => {
    if (!candidate || typeof candidate !== "object") return null;
    const item = candidate as Record<string, unknown>;
    if (!(item.score === null || (typeof item.score === "number" && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100)) || !Array.isArray(item.findings) || item.findings.length > 30) return null;
    const findings: EvaluationFinding[] = [];
    for (const entry of item.findings) {
      if (!entry || typeof entry !== "object") return null;
      const finding = entry as Record<string, unknown>;
      const confidence = finding.confidence;
      if (typeof finding.criterion !== "string" || !finding.criterion.trim() || typeof finding.finding !== "string" || !finding.finding.trim() || typeof finding.quote !== "string" || !Array.isArray(finding.sourceRefs) || finding.sourceRefs.length > 20 || finding.sourceRefs.some((ref) => typeof ref !== "string") || !["high", "medium", "low", "insufficient"].includes(String(confidence))) return null;
      const sourceRefs = finding.sourceRefs as string[];
      if (sourceRefs.some((reference) => !validReferences.has(reference))) return null;
      if (confidence !== "insufficient" && sourceRefs.length === 0) return null;
      findings.push({ criterion: finding.criterion.slice(0, 180), finding: finding.finding.slice(0, 2000), quote: finding.quote.slice(0, 600), sourceRefs, confidence: confidence as EvaluationFinding["confidence"] });
    }
    return { score: item.score as number | null, findings };
  };
  const mesaAcademic = layer(raw.mesaAcademic);
  const analytical = layer(raw.analytical);
  const professional = layer(raw.professional);
  if (!mesaAcademic || !analytical || !professional || !Array.isArray(raw.reconciliation) || raw.reconciliation.length > 30) return null;
  const reconciliation: EvaluationPayload["reconciliation"] = [];
  for (const rawItem of raw.reconciliation) {
    if (!rawItem || typeof rawItem !== "object") return null;
    const item = rawItem as Record<string, unknown>;
    if (typeof item.criterion !== "string" || typeof item.officialEvidence !== "string" || typeof item.analysis !== "string" || !["high", "medium", "low", "insufficient"].includes(String(item.confidence))) return null;
    reconciliation.push({ criterion: item.criterion.slice(0, 180), officialEvidence: item.officialEvidence.slice(0, 1000), analysis: item.analysis.slice(0, 2000), confidence: item.confidence as EvaluationPayload["reconciliation"][number]["confidence"] });
  }
  const summary = validateInsightSummary(raw.summary, validReferences);
  if (!summary) return null;
  return { mesaAcademic, analytical, professional, reconciliation, summary };
}
