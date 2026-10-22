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

// ── Randomised form (v2) ─────────────────────────────────────────────────────────────────────────────
// Each attempt draws 6 of the 10 IPIP Big-Five Factor Markers per factor (Goldberg, 1992; 50 public-domain
// items), balanced between positively and reverse-keyed wording, in a seeded random order. A fresh draw each
// time stops answers anchoring to a remembered form; scores are factor means on the 1–5 response scale, so
// they stay comparable across draws. Self-report only: how you describe yourself today, not how others see you.
export const PERSONALITY_RANDOM_VERSION = "ipip50-random-v1";

type PoolItem = { id: string; text: string; factor: Factor; reverse: boolean };
const pool = (factor: Factor, prefix: string, positive: string[], reverse: string[]): PoolItem[] => [
  ...positive.map((text, index) => ({ id: `${prefix}${index + 1}`, text, factor, reverse: false })),
  ...reverse.map((text, index) => ({ id: `${prefix}${positive.length + index + 1}`, text, factor, reverse: true })),
];
export const POOL: PoolItem[] = [
  ...pool("extraversion", "e", ["Am the life of the party.", "Feel comfortable around people.", "Start conversations.", "Talk to a lot of different people at parties.", "Don't mind being the center of attention."], ["Don't talk a lot.", "Keep in the background.", "Have little to say.", "Don't like to draw attention to myself.", "Am quiet around strangers."]),
  ...pool("agreeableness", "a", ["Am interested in people.", "Sympathize with others' feelings.", "Have a soft heart.", "Take time out for others.", "Feel others' emotions.", "Make people feel at ease."], ["Feel little concern for others.", "Insult people.", "Am not interested in other people's problems.", "Am not really interested in others."]),
  ...pool("conscientiousness", "c", ["Am always prepared.", "Pay attention to details.", "Get chores done right away.", "Like order.", "Follow a schedule.", "Am exacting in my work."], ["Leave my belongings around.", "Make a mess of things.", "Often forget to put things back in their proper place.", "Shirk my duties."]),
  ...pool("neuroticism", "n", ["Get stressed out easily.", "Worry about things.", "Am easily disturbed.", "Get upset easily.", "Change my mood a lot.", "Have frequent mood swings.", "Get irritated easily.", "Often feel blue."], ["Am relaxed most of the time.", "Seldom feel blue."]),
  ...pool("intellect", "i", ["Have a rich vocabulary.", "Have a vivid imagination.", "Have excellent ideas.", "Am quick to understand things.", "Use difficult words.", "Spend time reflecting on things.", "Am full of ideas."], ["Have difficulty understanding abstract ideas.", "Am not interested in abstract ideas.", "Do not have a good imagination."]),
];
const PER_FACTOR = 6;

function rng(seed: number) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state >>>= 0; state ^= state >> 17; state ^= state << 5; state >>>= 0; return state / 4_294_967_296; };
}
function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [copy[index], copy[swap]] = [copy[swap], copy[index]]; }
  return copy;
}

export function generatePersonalityForm(seed: number): PoolItem[] {
  const random = rng(seed);
  const chosen = (Object.keys(FACTOR_LABELS) as Factor[]).flatMap((factor) => {
    const items = POOL.filter((item) => item.factor === factor);
    const positive = shuffle(items.filter((item) => !item.reverse), random);
    const reverse = shuffle(items.filter((item) => item.reverse), random);
    const reverseCount = Math.min(reverse.length, PER_FACTOR / 2);
    return [...positive.slice(0, PER_FACTOR - reverseCount), ...reverse.slice(0, reverseCount)];
  });
  return shuffle(chosen, random);
}

export type RandomPersonalityResult = { version: string; scale: "mean_1_5"; factors: Record<Factor, { score: number; band: "lower" | "middle" | "higher"; items: number }>; complete: boolean; note?: string };

// Bands describe position on the response scale (agree vs disagree), not a comparison with other people.
export function scorePersonalityForm(seed: number, answers: Record<string, number>, note = ""): RandomPersonalityResult {
  const form = generatePersonalityForm(seed);
  const sums = Object.fromEntries((Object.keys(FACTOR_LABELS) as Factor[]).map((factor) => [factor, { total: 0, items: 0 }])) as Record<Factor, { total: number; items: number }>;
  for (const item of form) {
    const value = answers[item.id];
    if (!Number.isInteger(value) || value < 1 || value > 5) continue;
    sums[item.factor].total += item.reverse ? 6 - value : value;
    sums[item.factor].items += 1;
  }
  const factors = Object.fromEntries(Object.entries(sums).map(([factor, sum]) => {
    const score = sum.items ? Math.round((sum.total / sum.items) * 100) / 100 : 0;
    return [factor, { score, band: score <= 2.5 ? "lower" : score >= 3.5 ? "higher" : "middle", items: sum.items }];
  })) as RandomPersonalityResult["factors"];
  const clean = note.trim().slice(0, 800);
  return { version: PERSONALITY_RANDOM_VERSION, scale: "mean_1_5", factors, complete: Object.values(sums).every((sum) => sum.items === PER_FACTOR), ...(clean ? { note: clean } : {}) };
}

// How to read each factor. Agreeableness items mix warmth with going along with others, so they cannot tell
// "I prefer objective, evidence-led decisions" apart from "I don't sympathise" — the reading says so.
export const FACTOR_READINGS: Record<Factor, string> = {
  extraversion: "Energy from social settings and comfort taking the floor. Neither end is better; it shapes how you prefer to work, not how well.",
  agreeableness: "Mixes warmth (feeling others' emotions) with accommodation (going along to keep harmony). A middle or lower score often reflects preferring objective, evidence-led decisions, which is not the same as lacking empathy. This questionnaire cannot separate the two; your own note and how you act in the room carry that context.",
  conscientiousness: "Preference for order, preparation and follow-through. Describes habits you report, not the quality of your work.",
  neuroticism: "How strongly stress and setbacks register for you. Situational: deadlines and context move it.",
  intellect: "Interest in ideas, abstraction and imagination. Interest, not ability — the reasoning test and your coursework speak to ability.",
};
