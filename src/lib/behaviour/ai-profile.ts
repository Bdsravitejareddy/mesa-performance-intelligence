// Parses the reply to the profile prompt: the closing JSON block (or a bare JSON object) plus the narrative.
export type AiProfile = {
  source: "chatgpt" | "claude-personal" | "claude-team" | "other";
  windowDays: number | null;
  conversationsSeen: number | null;
  findings: { area: string; claim: string; tag: "Observed" | "Inferred" | "Uncertain"; examples: { date: string; paraphrase: string }[]; counterExamples: { date: string; paraphrase: string }[] }[];
  changes: { what: string; from: string; to: string; when: string; evidence: string }[];
  limits: string;
  validationQuestions: string[];
};

const SOURCES = new Set(["chatgpt", "claude-personal", "claude-team", "other"]);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const examples = (value: unknown) => (Array.isArray(value) ? value as Record<string, unknown>[] : []).map((item) => ({ date: text(item.date, 20), paraphrase: text(item.paraphrase, 400) })).filter((item) => item.paraphrase).slice(0, 5);

export function parseAiProfile(reply: string, fallbackSource: string): AiProfile | null {
  const fenced = [...reply.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((match) => match[1]).reverse();
  const candidates = [...fenced, reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1)];
  let raw: Record<string, unknown> | null = null;
  for (const candidate of candidates) {
    try { const value = JSON.parse(candidate); if (value && typeof value === "object" && Array.isArray(value.findings)) { raw = value; break; } } catch { /* try the next block */ }
  }
  if (!raw) return null;
  const source = SOURCES.has(String(raw.source)) ? raw.source as AiProfile["source"] : SOURCES.has(fallbackSource) ? fallbackSource as AiProfile["source"] : "other";
  const tags = new Set(["Observed", "Inferred", "Uncertain"]);
  const findings = (raw.findings as Record<string, unknown>[]).map((item) => ({
    area: text(item.area, 40), claim: text(item.claim, 600),
    tag: (tags.has(String(item.tag)) ? item.tag : "Uncertain") as AiProfile["findings"][number]["tag"],
    examples: examples(item.examples), counterExamples: examples(item.counter_examples),
  })).filter((item) => item.claim).slice(0, 40);
  if (!findings.length) return null;
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null);
  return {
    source, windowDays: number(raw.window_days), conversationsSeen: number(raw.conversations_seen), findings,
    changes: (Array.isArray(raw.changes) ? raw.changes as Record<string, unknown>[] : []).map((item) => ({ what: text(item.what, 200), from: text(item.from, 200), to: text(item.to, 200), when: text(item.when, 60), evidence: text(item.evidence, 400) })).filter((item) => item.what).slice(0, 12),
    limits: text(raw.limits, 1000),
    validationQuestions: (Array.isArray(raw.validation_questions) ? raw.validation_questions : []).map((item) => text(item, 300)).filter(Boolean).slice(0, 6),
  };
}

// Text for the behaviour analysis: the assistant's view, labelled as such.
export function profileAsSource(profile: AiProfile): string {
  return [
    ...profile.findings.map((item) => `[${item.tag}] (${item.area}) ${item.claim}${item.examples.length ? ` — e.g. ${item.examples.map((example) => `${example.date} ${example.paraphrase}`).join("; ")}` : ""}${item.counterExamples.length ? ` — counter: ${item.counterExamples.map((example) => example.paraphrase).join("; ")}` : ""}`),
    ...profile.changes.map((change) => `Change: ${change.what} (${change.from} → ${change.to}, ${change.when})${change.evidence ? `: ${change.evidence}` : ""}`),
  ].join("\n").slice(0, 8000);
}
