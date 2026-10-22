// Mini-IPIP (Donnellan, Oswald, Baird & Lucas, 2006): a 20-item public-domain Big Five measure from the
// International Personality Item Pool. Self-report preferences, not ability. Scored on its own 4–20 scale;
// without validated norms for this population no percentile or comparison is produced.

export const PERSONALITY_VERSION = "mini-ipip-v1";
export type Factor = "extraversion" | "agreeableness" | "conscientiousness" | "neuroticism" | "intellect";
export const FACTOR_LABELS: Record<Factor, string> = {
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  conscientiousness: "Conscientiousness",
  neuroticism: "Neuroticism (emotional reactivity)",
  intellect: "Intellect / Imagination",
};

export const ITEMS: { id: string; text: string; factor: Factor; reverse: boolean }[] = [
  { id: "p1", text: "Am the life of the party.", factor: "extraversion", reverse: false },
  { id: "p2", text: "Sympathize with others' feelings.", factor: "agreeableness", reverse: false },
  { id: "p3", text: "Get chores done right away.", factor: "conscientiousness", reverse: false },
  { id: "p4", text: "Have frequent mood swings.", factor: "neuroticism", reverse: false },
  { id: "p5", text: "Have a vivid imagination.", factor: "intellect", reverse: false },
  { id: "p6", text: "Don't talk a lot.", factor: "extraversion", reverse: true },
  { id: "p7", text: "Am not interested in other people's problems.", factor: "agreeableness", reverse: true },
  { id: "p8", text: "Often forget to put things back in their proper place.", factor: "conscientiousness", reverse: true },
  { id: "p9", text: "Am relaxed most of the time.", factor: "neuroticism", reverse: true },
  { id: "p10", text: "Am not interested in abstract ideas.", factor: "intellect", reverse: true },
  { id: "p11", text: "Talk to a lot of different people at parties.", factor: "extraversion", reverse: false },
  { id: "p12", text: "Feel others' emotions.", factor: "agreeableness", reverse: false },
  { id: "p13", text: "Like order.", factor: "conscientiousness", reverse: false },
  { id: "p14", text: "Get upset easily.", factor: "neuroticism", reverse: false },
  { id: "p15", text: "Have difficulty understanding abstract ideas.", factor: "intellect", reverse: true },
  { id: "p16", text: "Keep in the background.", factor: "extraversion", reverse: true },
  { id: "p17", text: "Am not really interested in others.", factor: "agreeableness", reverse: true },
  { id: "p18", text: "Make a mess of things.", factor: "conscientiousness", reverse: true },
  { id: "p19", text: "Seldom feel blue.", factor: "neuroticism", reverse: true },
  { id: "p20", text: "Do not have a good imagination.", factor: "intellect", reverse: true },
];

export const SCALE = ["Very inaccurate", "Moderately inaccurate", "Neither", "Moderately accurate", "Very accurate"];

export type PersonalityResult = { factors: Record<Factor, { score: number; band: "lower" | "middle" | "higher" }>; complete: boolean };

// Answers are 1–5. Bands describe position on the scale itself (4–9, 10–14, 15–20), not relative to other people.
export function scorePersonality(answers: Record<string, number>): PersonalityResult {
  const factors = Object.fromEntries((Object.keys(FACTOR_LABELS) as Factor[]).map((factor) => [factor, { score: 0, band: "middle" as const }])) as PersonalityResult["factors"];
  let answered = 0;
  for (const item of ITEMS) {
    const value = answers[item.id];
    if (!Number.isInteger(value) || value < 1 || value > 5) continue;
    answered += 1;
    factors[item.factor].score += item.reverse ? 6 - value : value;
  }
  for (const factor of Object.values(factors)) factor.band = factor.score <= 9 ? "lower" : factor.score >= 15 ? "higher" : "middle";
  return { factors, complete: answered === ITEMS.length };
}
