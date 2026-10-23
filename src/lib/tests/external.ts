import type { Factor } from "./personality";

// Results from other tools, entered by the member. 16Personalities and CliftonStrengths are proprietary and not
// peer-reviewed in the way the IPIP is, so their results are context: shown, mapped approximately onto the Big
// Five and the skill domains, and never treated as a measurement.

// 16Personalities reports five aspects. Their poles line up with Big Five factors as the MBTI dimensions do
// (McCrae & Costa, 1989): Mind ↔ extraversion, Energy (intuitive) ↔ intellect, Nature (feeling) ↔ agreeableness,
// Tactics (judging) ↔ conscientiousness, Identity (turbulent) ↔ neuroticism.
export type SixteenP = { type: string; percents: Partial<Record<"mind" | "energy" | "nature" | "tactics" | "identity", number>> };
const LETTERS = /^([EI])([NS])([TF])([JP])(?:-([AT]))?$/i;

export function parseSixteenP(type: string, percents: SixteenP["percents"] = {}): SixteenP | null {
  const clean = type.trim().toUpperCase().replace(/\s+/g, "");
  return LETTERS.test(clean) ? { type: clean, percents } : null;
}

// Approximate Big Five positions on the 1–5 scale. With a reported percentage (e.g. 70% Introverted) the position
// follows it; with only the letter it is placed at a moderate lean (2 or 4).
export function sixteenPToBigFive(result: SixteenP): Record<Factor, number | null> {
  const [, mind, energy, nature, tactics, identity] = result.type.match(LETTERS) ?? [];
  const lean = (strength: number | undefined, towardsHigh: boolean) => { const share = strength !== undefined ? Math.min(100, Math.max(50, strength)) / 100 : 0.75; const high = towardsHigh ? share : 1 - share; return Math.round((1 + 4 * high) * 10) / 10; };
  return {
    extraversion: mind ? lean(result.percents.mind, mind === "E") : null,
    intellect: energy ? lean(result.percents.energy, energy === "N") : null,
    agreeableness: nature ? lean(result.percents.nature, nature === "F") : null,
    conscientiousness: tactics ? lean(result.percents.tactics, tactics === "J") : null,
    neuroticism: identity ? lean(result.percents.identity, identity === "T") : null,
  };
}

// CliftonStrengths: 34 talent themes in four domains, as Gallup publishes them.
export const CLIFTON_DOMAINS: Record<string, string[]> = {
  Executing: ["Achiever", "Arranger", "Belief", "Consistency", "Deliberative", "Discipline", "Focus", "Responsibility", "Restorative"],
  Influencing: ["Activator", "Command", "Communication", "Competition", "Maximizer", "Self-Assurance", "Significance", "Woo"],
  "Relationship Building": ["Adaptability", "Connectedness", "Developer", "Empathy", "Harmony", "Includer", "Individualization", "Positivity", "Relator"],
  "Strategic Thinking": ["Analytical", "Context", "Futuristic", "Ideation", "Input", "Intellection", "Learner", "Strategic"],
};
export const CLIFTON_THEMES = Object.values(CLIFTON_DOMAINS).flat();
// Which dashboard skill domains each Gallup domain most plausibly informs (a self-reported talent, not a skill).
export const CLIFTON_TO_SKILLS: Record<string, string[]> = {
  Executing: ["Execution"], Influencing: ["Communication", "Leadership"], "Relationship Building": ["Leadership"], "Strategic Thinking": ["Analytical reasoning", "Creativity", "Learning agility"],
};

export function parseClifton(themes: string[]): string[] {
  const known = new Map(CLIFTON_THEMES.map((theme) => [theme.toLowerCase(), theme]));
  return [...new Set(themes.map((theme) => known.get(theme.trim().toLowerCase())).filter((theme): theme is string => Boolean(theme)))].slice(0, 10);
}

export function cliftonDomains(themes: string[]): { domain: string; themes: string[] }[] {
  return Object.entries(CLIFTON_DOMAINS).map(([domain, members]) => ({ domain, themes: themes.filter((theme) => members.includes(theme)) })).filter((row) => row.themes.length);
}
