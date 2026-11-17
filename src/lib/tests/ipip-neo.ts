import type { Factor } from "./personality";

// An IPIP-NEO result the member took elsewhere (e.g. the 300-item IPIP-NEO, Goldberg's public-domain version of the
// NEO PI-R facets), read from the result PDF. Self-report, like the in-app questionnaire, but far longer: five
// traits, each the sum of six facets. Percentiles are the test site's own comparison (often Johnson's online sample),
// kept with the norm group exactly as printed; they are not official norms and are never recomputed here.

export type NeoTrait = "openness" | "conscientiousness" | "extraversion" | "agreeableness" | "neuroticism";
export type NeoLevel = "low" | "average" | "high";
export type NeoScore = { raw: number; max: number; level: NeoLevel; percentile: number | null };
export type IpipNeo = {
  form: string; takenOn: string | null; durationSeconds: number | null; normGroup: string; normNote: string;
  traits: Record<NeoTrait, NeoScore & { percentOfRange: number | null }>;
  facets: (NeoScore & { name: string; trait: NeoTrait })[];
  // Each trait total checked against the sum of its six facets.
  consistent: boolean;
  // Things in the report itself that do not add up, shown rather than corrected.
  anomalies: string[];
};

export const NEO_TRAITS: { key: NeoTrait; label: string; facets: string[] }[] = [
  { key: "openness", label: "Openness to Experience", facets: ["Imagination", "Artistic Interests", "Emotionality", "Adventurousness", "Intellect", "Liberalism"] },
  { key: "conscientiousness", label: "Conscientiousness", facets: ["Self-Efficacy", "Orderliness", "Dutifulness", "Achievement-Striving", "Self-Discipline", "Cautiousness"] },
  { key: "extraversion", label: "Extraversion", facets: ["Friendliness", "Gregariousness", "Assertiveness", "Activity Level", "Excitement-Seeking", "Cheerfulness"] },
  { key: "agreeableness", label: "Agreeableness", facets: ["Trust", "Morality", "Altruism", "Cooperation", "Modesty", "Sympathy"] },
  { key: "neuroticism", label: "Neuroticism", facets: ["Anxiety", "Anger", "Depression", "Self-Consciousness", "Immoderation", "Vulnerability"] },
];
const TRAIT_PATTERN: Record<NeoTrait, string> = { openness: "Openness\\s+To\\s+Experience", conscientiousness: "Conscientiousness", extraversion: "Extraversion", agreeableness: "Agreeableness", neuroticism: "Neuroticism" };
const LEVEL = "(↑\\s*High|→\\s*Average|↓\\s*Low|High|Average|Low)";
const levelOf = (text: string): NeoLevel => (/high/i.test(text) ? "high" : /low/i.test(text) ? "low" : "average");
const escape = (value: string) => value.replace(/[-]/g, "-\\s*").replace(/\s+/g, "\\s+");

// PDF text comes out with ligatures split ("arti fi cial", "Self-E ffi cacy") and hyphens followed by spaces.
export function normalizeNeoText(text: string): string {
  return text.replace(/=== page \d+/g, " ").replace(/([A-Za-z])\s*(ffi|ffl|fi|fl|ff)\s+(?=[a-z])/g, "$1$2").replace(/\s*-\s+/g, "-").replace(/\s+/g, " ").trim();
}

export function parseIpipNeo(raw: string): IpipNeo | { error: string } {
  const text = normalizeNeoText(raw);
  const traits = {} as IpipNeo["traits"];
  for (const { key } of NEO_TRAITS) {
    const match = new RegExp(`${TRAIT_PATTERN[key]}\\s+${LEVEL}\\s+(\\d+)\\s*of\\s*(\\d+)\\s*·\\s*(\\d+)\\s*%\\s*Higher than\\s*(\\d+)\\s*%`, "i").exec(text);
    if (!match) return { error: `The ${key} score was not found; this does not look like an IPIP-NEO result.` };
    traits[key] = { raw: Number(match[2]), max: Number(match[3]), level: levelOf(match[1]), percentOfRange: Number(match[4]), percentile: Number(match[5]) };
  }
  const facets: IpipNeo["facets"] = [];
  for (const trait of NEO_TRAITS) {
    for (const name of trait.facets) {
      const match = new RegExp(`${escape(name)}\\s+${LEVEL}\\s+(\\d+)\\s*of\\s*(\\d+)\\s*Higher than\\s*(\\d+)\\s*%`, "i").exec(text);
      if (match) facets.push({ name, trait: trait.key, raw: Number(match[2]), max: Number(match[3]), level: levelOf(match[1]), percentile: Number(match[4]) });
    }
  }
  if (facets.length < 24) return { error: `Only ${facets.length} of the 30 facets were found; the result could not be read reliably.` };
  const sane = [...Object.values(traits), ...facets].every((score) => score.raw > 0 && score.raw <= score.max && (score.percentile === null || (score.percentile >= 0 && score.percentile <= 100)));
  if (!sane) return { error: "A score is outside its range; the result could not be read reliably." };
  const consistent = NEO_TRAITS.every(({ key }) => {
    const own = facets.filter((facet) => facet.trait === key);
    return own.length === 6 && own.reduce((sum, facet) => sum + facet.raw, 0) === traits[key].raw;
  });
  const taken = /Taken\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/.exec(text)?.[1];
  const duration = /Time spent\s+(\d{1,3}):(\d{2})/.exec(text);
  const items = Object.values(traits).reduce((sum, score) => sum + score.max / 5, 0);
  const group = /Compared with\s+(Men|Women|Everyone|All)\s*,?\s*(\d{2})\s*[–-]\s*(\d{2})/i.exec(text);
  const sample = /Compared with\s+([\d,]+)\s+people who answered the same\s+(\d+)\s+statements[^.]*\(([^)]+)\)/i.exec(text);
  const form = /IPIP-NEO-\d+/.exec(text)?.[0] ?? `IPIP-NEO-${items}`;
  const anomalies: string[] = [];
  if (!consistent) anomalies.push("A trait total does not equal the sum of its six facets.");
  // A level and a percentile that point opposite ways ("High, higher than 48%") suggest a slip in the report.
  for (const facet of facets) if (facet.percentile !== null && ((facet.level === "high" && facet.percentile < 50) || (facet.level === "low" && facet.percentile > 50))) anomalies.push(`${facet.name} is reported as ${facet.level} (${facet.raw}/${facet.max}) but higher than only ${facet.percentile}% of the comparison group; one of the two is likely wrong.`);
  if (sample && Number(sample[2]) !== items) anomalies.push(`Percentiles compare you with people who answered the ${sample[2]}-statement form, not the ${items}-statement form you took, so they are approximate.`);
  return {
    form,
    takenOn: taken && Number.isFinite(Date.parse(`${taken} UTC`)) ? new Date(`${taken} UTC`).toISOString().slice(0, 10) : null,
    durationSeconds: duration ? Number(duration[1]) * 60 + Number(duration[2]) : null,
    normGroup: group ? `${group[1]} aged ${group[2]}–${group[3]}` : "",
    normNote: sample ? `${sample[1]} people who answered the ${sample[2]}-statement form (${sample[3]}); not official norms` : "",
    traits, facets, consistent, anomalies,
  };
}

// The dashboard's five factors on its 1–5 answer scale, from mean item scores (a facet has 10 items, a trait 60).
// "Intellect / Imagination" (the IPIP Big-Five markers) is narrower than NEO Openness, so it is taken from the
// Intellect and Imagination facets, not the whole Openness trait.
export function neoOnDashboardScale(result: IpipNeo): Record<Factor, number> {
  const mean = (score: { raw: number; max: number }) => Math.round((score.raw / (score.max / 5)) * 100) / 100;
  const facet = (name: string) => result.facets.find((item) => item.name === name);
  const intellect = [facet("Intellect"), facet("Imagination")].filter((item): item is NonNullable<typeof item> => Boolean(item));
  return {
    extraversion: mean(result.traits.extraversion), agreeableness: mean(result.traits.agreeableness), conscientiousness: mean(result.traits.conscientiousness), neuroticism: mean(result.traits.neuroticism),
    intellect: intellect.length ? mean({ raw: intellect.reduce((sum, item) => sum + item.raw, 0), max: intellect.reduce((sum, item) => sum + item.max, 0) }) : mean(result.traits.openness),
  };
}

// Facets that clearly break from their trait (25+ percentile points away): often more telling than the average.
// A facet the report itself states inconsistently is left out, as everywhere else on the page.
export function standoutFacets(result: IpipNeo): (IpipNeo["facets"][number] & { traitPercentile: number })[] {
  return result.facets.filter((facet) => !doubtfulFacet(result, facet.name) && facet.percentile !== null && result.traits[facet.trait].percentile !== null && Math.abs(facet.percentile - result.traits[facet.trait].percentile!) >= 25)
    .map((facet) => ({ ...facet, traitPercentile: result.traits[facet.trait].percentile! }));
}

// A short, plain description for an AI reader: trait percentiles, the facets that break from their trait, and what the
// report itself gets wrong. Labelled as self-report by the caller.
export function neoSummaryText(result: IpipNeo): string {
  const traits = NEO_TRAITS.map(({ key, label }) => `${label}: ${result.traits[key].raw}/${result.traits[key].max}, ${result.traits[key].level}, higher than ${result.traits[key].percentile ?? "?"}% of ${result.normGroup || "the comparison group"}`);
  const standouts = standoutFacets(result).map((facet) => `${facet.name} ${facet.percentile}% (its trait ${facet.traitPercentile}%)`);
  return [`${result.form}, taken ${result.takenOn ?? "date unknown"}.`, ...traits, standouts.length ? `Facets that break from their trait: ${standouts.join("; ")}.` : "", result.anomalies.length ? `Report caveats: ${result.anomalies.join(" ")}` : ""].filter(Boolean).join("\n");
}

// A facet named in the report's own inconsistencies (e.g. "High" at the 48th percentile).
export const doubtfulFacet = (result: IpipNeo, name: string) => result.anomalies.some((note) => note.startsWith(`${name} `));
