import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestJsonFromProvider } from "@/lib/ai/provider";
import { resolveProviderSettings } from "@/lib/ai/settings";
import type { Finding } from "./swot-story";

// The AI only rewords findings that were already ranked and built from evidence. Its output is kept only when
// it passes deterministic checks; otherwise the built-in wording stands. The rules version is part of the key,
// so changing these instructions invalidates every earlier write-up.
export const SWOT_RULES_VERSION = "swot-story-v1-2026-10-24";

export type CardText = { headline: string; body: string; action: string | null };
export type SwotNarrative = { standsOut: string; cards: Record<string, CardText>; rulesVersion: string; sources: string[] };

const SYSTEM = [
  "You are a thoughtful mentor who has read a student's work carefully. Rewrite the supplied SWOT findings so each reads as a short, connected story, and write one opening paragraph.",
  "Write to the student as \"you\" in natural, everyday English: candid, specific, measured. No jargon, no inflated praise, no repeated caveats, no templates — vary sentence structure from card to card.",
  "Use only the facts in each finding. Never add a figure, assessment, course, role or claim that is not in that finding. Keep any number exactly as given.",
  "Respect each finding's evidence: say \"AI estimate\" for AI-estimated results and never call them official; say a CV entry is your own account, never proof; a qualification is context, not proficiency; missing evidence is never a weakness; never say a skill improved or declined; keep a course result about that course, not about career readiness or personality. When results conflict, say so plainly instead of averaging.",
  "Never use these phrases or close variants: \"turn emerging\", \"demonstrated strength\", \"supported resume claims\", \"lead with your strongest example\", \"low confidence\", \"medium impact\", \"possibility\", \"leverage\", \"showcase\", \"in another context\".",
  "standsOut: 60–90 words connecting the main strength, the most important tension and the next priority, drawn from the highest-priority findings.",
  "For each finding give headline (a takeaway in under 12 words), body (one or two sentences: what the evidence suggests and why it matters) and action (keep the finding's next step specific; null when the finding has none). Headline + body + action together: 40–65 words.",
  "Return JSON {\"standsOut\":string,\"cards\":{\"<finding key>\":{\"headline\":string,\"body\":string,\"action\":string|null}}}.",
].join(" ");

const BANNED = /turn emerging|demonstrated strength|supported (resume|cv) claims?|lead with your strongest|low confidence|medium impact|high impact|\bpossibility\b|leverage|showcase|in another context|\bimprov(ed|ing|ement)\b|\bdeclin(ed|ing)\b/i;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const numbersIn = (text: string) => [...text.replace(/(\d),(\d{3})/g, "$1$2").matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));

export function checkCard(finding: Finding, raw: unknown): CardText | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const headline = String(item.headline ?? "").trim(), body = String(item.body ?? "").trim();
  const action = finding.action && typeof item.action === "string" && item.action.trim() ? item.action.trim() : null;
  if (!headline || !body || words(headline) > 14) return null;
  const all = [headline, body, action ?? ""].join(" ");
  const total = words(all);
  if (total < 25 || total > 80 || BANNED.test(all)) return null;
  // Every figure must come from the finding itself.
  const allowed = new Set(finding.numbers);
  if (numbersIn(all).some((value) => !allowed.has(Math.round(value * 10) / 10))) return null;
  const classes = new Set(finding.evidence.map((row) => row.class));
  // Never "official" where the finding has no official evidence; AI-only findings must say so.
  // ("no official mark yet" is fine; "your official mark" is not.)
  if (/official/i.test(all.replace(/\b(?:no|not|without|isn't|aren't|never|before)\s+(?:an?\s+|any\s+)?official\b/gi, "")) && !classes.has("official")) return null;
  if (finding.kind === "ai_signal" || (finding.kind === "conflict" && !classes.has("official"))) { if (!/\bAI\b|estimate/i.test(all)) return null; }
  if (finding.kind === "self_reported" && !/\bCV\b|résumé|resume|your own account|you describe|you say/i.test(all)) return null;
  return { headline, body, action };
}

export function checkStandsOut(text: unknown, findings: Finding[]): string | null {
  const value = String(text ?? "").trim();
  const count = words(value);
  if (count < 45 || count > 105 || BANNED.test(value)) return null;
  const allowed = new Set(findings.flatMap((finding) => finding.numbers));
  return numbersIn(value).every((number) => allowed.has(Math.round(number * 10) / 10)) ? value : null;
}

// Only what the model needs: the ranked findings, their facts and the kinds of evidence behind them.
function promptInput(findings: Finding[]) {
  return findings.slice(0, 18).map((finding) => ({ key: finding.key, section: finding.category, kind: finding.kind, subject: finding.subject, priority: finding.priority, relevance: finding.relevance, keyFact: finding.keyFact, draft: { headline: finding.headline, body: finding.body, action: finding.action },
    evidenceKinds: [...new Set(finding.evidence.map((row) => row.class))], evidence: finding.evidence.slice(0, 4).map((row) => `${row.label}: ${row.detail}`.slice(0, 240)) }));
}

export function narrativeKey(findings: Finding[]): string {
  return createHash("sha256").update(JSON.stringify({ input: promptInput(findings), rules: SWOT_RULES_VERSION, prompt: SYSTEM })).digest("hex");
}

export async function readNarrative(client: SupabaseClient, key: string): Promise<SwotNarrative | null> {
  const { data } = await client.from("swot_narratives").select("narrative").eq("input_hash", key).limit(1).maybeSingle();
  return (data?.narrative as SwotNarrative | undefined) ?? null;
}

export async function generateNarrative(client: SupabaseClient, userId: string, findings: Finding[]): Promise<SwotNarrative | null> {
  if (!findings.length) return null;
  const key = narrativeKey(findings);
  const existing = await readNarrative(client, key);
  if (existing) return existing;
  const request = () => requestJsonFromProvider(SYSTEM, JSON.stringify({ findings: promptInput(findings) }), { timeoutMs: 90_000 });
  const raw = await request().catch(() => request()).catch(() => null);
  if (!raw) return null;
  const cardsRaw = (raw.cards && typeof raw.cards === "object" ? raw.cards : {}) as Record<string, unknown>;
  const cards: Record<string, CardText> = {};
  for (const finding of findings) { const card = checkCard(finding, cardsRaw[finding.key]); if (card) cards[finding.key] = card; }
  const standsOut = checkStandsOut(raw.standsOut, findings);
  if (!standsOut && !Object.keys(cards).length) return null;
  const narrative: SwotNarrative = { standsOut: standsOut ?? "", cards, rulesVersion: SWOT_RULES_VERSION, sources: findings.slice(0, 18).map((finding) => finding.key) };
  await client.from("swot_narratives").insert({ user_id: userId, input_hash: key, rules_version: SWOT_RULES_VERSION, narrative, provider_model: resolveProviderSettings().model.slice(0, 120) });
  return narrative;
}
