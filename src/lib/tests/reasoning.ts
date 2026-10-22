// Parametric reasoning test. Items are generated from a seed, so every attempt is new and the server can
// regenerate the answer key to score a submission without ever sending answers to the browser.

export const REASONING_VERSION = "reasoning-v1";
export const REASONING_SECONDS = 12 * 60;
export type Section = "numerical" | "logical" | "verbal";
export type Item = { id: string; section: Section; prompt: string; options: string[]; answer: number; explanation: string };
export type PublicItem = Omit<Item, "answer" | "explanation">;

// Mulberry32: small, deterministic PRNG.
export function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = ReturnType<typeof rng>;
const int = (r: Rand, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const pick = <T,>(r: Rand, list: readonly T[]) => list[Math.floor(r() * list.length)];
const fmt = (value: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);

// Places the correct answer among distinct distractors at a seeded position.
function options(r: Rand, correct: string, distractors: string[]): { options: string[]; answer: number } {
  const unique = [...new Set(distractors.filter((item) => item !== correct))].slice(0, 3);
  while (unique.length < 3) unique.push(`${correct} (approx.)`.replace(" (approx.)", ` ±${unique.length + 1}`));
  const answer = int(r, 0, 3);
  const list = [...unique];
  list.splice(answer, 0, correct);
  return { options: list, answer };
}

const NUMERICAL = [
  (r: Rand) => {
    const before = int(r, 20, 90) * 10, change = pick(r, [-25, -20, -15, -10, 10, 12, 15, 20, 25, 40]);
    const after = before * (1 + change / 100);
    const { options: o, answer } = options(r, `${change > 0 ? "+" : ""}${change}%`, [`${change > 0 ? "+" : ""}${change + 5}%`, `${-change}%`, `${change > 0 ? "+" : ""}${Math.round(((after - before) / after) * 100)}%`]);
    return { prompt: `Monthly orders went from ${fmt(before)} to ${fmt(after)}. What is the percentage change?`, options: o, answer, explanation: `(${fmt(after)} − ${fmt(before)}) ÷ ${fmt(before)} = ${change}%.` };
  },
  (r: Rand) => {
    const price = int(r, 4, 12) * 50, cost = price - int(r, 2, 6) * 25, fixed = int(r, 4, 20) * 5000;
    const units = Math.ceil(fixed / (price - cost));
    const { options: o, answer } = options(r, fmt(units), [fmt(Math.ceil(fixed / price)), fmt(units * 2), fmt(Math.ceil(fixed / cost))]);
    return { prompt: `A product sells for ₹${price} and costs ₹${cost} per unit to make. Fixed costs are ₹${fmt(fixed)} per month. How many units are needed to break even (rounded up)?`, options: o, answer, explanation: `Contribution per unit is ₹${price - cost}; ${fmt(fixed)} ÷ ${price - cost} = ${fmt(units)} units.` };
  },
  (r: Rand) => {
    const share = int(r, 15, 45), market = int(r, 2, 9) * 1000, growth = pick(r, [10, 20, 25, 50]);
    const next = (market * (1 + growth / 100) * share) / 100;
    const { options: o, answer } = options(r, `₹${fmt(next)} crore`, [`₹${fmt((market * share) / 100)} crore`, `₹${fmt((market * growth) / 100)} crore`, `₹${fmt(next * 1.1)} crore`]);
    return { prompt: `A market worth ₹${fmt(market)} crore grows ${growth}% next year. If a company keeps a ${share}% share, what is its revenue next year?`, options: o, answer, explanation: `${fmt(market)} × ${1 + growth / 100} × ${share}% = ₹${fmt(next)} crore.` };
  },
  (r: Rand) => {
    const a = int(r, 2, 9), b = int(r, 2, 9), total = (a + b) * int(r, 5, 30);
    const part = (total * a) / (a + b);
    const { options: o, answer } = options(r, fmt(part), [fmt((total * b) / (a + b)), fmt(total / a), fmt(part + a)]);
    return { prompt: `A team of ${total} people is split between sales and operations in the ratio ${a}:${b}. How many work in sales?`, options: o, answer, explanation: `${total} × ${a}/${a + b} = ${fmt(part)}.` };
  },
  (r: Rand) => {
    const visitors = int(r, 20, 90) * 1000, signup = int(r, 5, 20), paid = int(r, 5, 25);
    const customers = Math.round(visitors * (signup / 100) * (paid / 100));
    const { options: o, answer } = options(r, fmt(customers), [fmt(Math.round(visitors * ((signup + paid) / 100))), fmt(Math.round(visitors * (signup / 100))), fmt(customers * 10)]);
    return { prompt: `${fmt(visitors)} people visit a site; ${signup}% sign up and ${paid}% of sign-ups pay. How many paying customers is that?`, options: o, answer, explanation: `${fmt(visitors)} × ${signup}% × ${paid}% = ${fmt(customers)}.` };
  },
];

const LOGICAL = [
  (r: Rand) => {
    const start = int(r, 2, 20), step = int(r, 3, 9);
    const series = Array.from({ length: 5 }, (_, i) => start + i * step);
    const correct = start + 5 * step;
    const { options: o, answer } = options(r, String(correct), [String(correct + step), String(correct - 1), String(series[4] * 2)]);
    return { prompt: `What comes next? ${series.join(", ")}, …`, options: o, answer, explanation: `Each term adds ${step}.` };
  },
  (r: Rand) => {
    const start = int(r, 2, 5), factor = int(r, 2, 3);
    const series = Array.from({ length: 4 }, (_, i) => start * factor ** i);
    const correct = start * factor ** 4;
    const { options: o, answer } = options(r, String(correct), [String(series[3] + (series[3] - series[2])), String(correct + factor), String(correct * factor)]);
    return { prompt: `What comes next? ${series.join(", ")}, …`, options: o, answer, explanation: `Each term is multiplied by ${factor}.` };
  },
  (r: Rand) => {
    const [a, b, c] = pick(r, [["analysts", "graduates", "hired by the firm"], ["managers", "trained in negotiation", "promoted this year"], ["startups", "venture-funded", "profitable"]] as const);
    const valid = r() < 0.5;
    const premise = valid ? `All ${a} are ${b}. Everyone ${b} is ${c}.` : `All ${a} are ${b}. Some ${b} are ${c}.`;
    const { options: o, answer } = options(r, valid ? "Must be true" : "Cannot be determined", [valid ? "Cannot be determined" : "Must be true", "Must be false", "True only for some"]);
    return { prompt: `${premise} Is it true that all ${a} are ${c}?`, options: o, answer, explanation: valid ? "The chain of “all” statements makes it certain." : "“Some” does not cover every case, so it cannot be determined." };
  },
  (r: Rand) => {
    const names = ["Asha", "Ben", "Chitra", "Dev"].sort(() => r() - 0.5);
    // names[0] > names[1] > names[2] > names[3]
    const { options: o, answer } = options(r, names[0], [names[1], names[2], names[3]]);
    return { prompt: `${names[1]} sold more than ${names[2]}. ${names[0]} sold more than ${names[1]}. ${names[3]} sold the least. Who sold the most?`, options: o, answer, explanation: `${names[0]} > ${names[1]} > ${names[2]} > ${names[3]}.` };
  },
];

const VERBAL = [
  (r: Rand) => {
    const city = pick(r, ["Pune", "Jaipur", "Kochi", "Indore"]), pct = int(r, 30, 70);
    const kind = pick(r, ["true", "false", "cannot"] as const);
    const statement = kind === "true" ? `More than a quarter of ${city} orders were delivered within 30 minutes.` : kind === "false" ? `Fewer than 10% of ${city} orders were delivered within 30 minutes.` : `${city} customers prefer 30-minute delivery to lower prices.`;
    const correct = kind === "true" ? "True" : kind === "false" ? "False" : "Cannot say";
    const { options: o, answer } = options(r, correct, ["True", "False", "Cannot say"].filter((item) => item !== correct).concat(["Partly true"]));
    return { prompt: `Passage: “In ${city}, ${pct}% of last month's orders were delivered within 30 minutes; the company did not survey customer preferences.” Statement: ${statement}`, options: o, answer, explanation: kind === "cannot" ? "The passage says preferences were not surveyed." : `The passage gives ${pct}%.` };
  },
  (r: Rand) => {
    const product = pick(r, ["the subscription plan", "the premium tier", "the new app"]), rise = int(r, 5, 30);
    const kind = pick(r, ["true", "cannot"] as const);
    const statement = kind === "true" ? `Revenue from ${product} increased after the launch of the campaign.` : `The campaign caused the increase in revenue from ${product}.`;
    const correct = kind === "true" ? "True" : "Cannot say";
    const { options: o, answer } = options(r, correct, ["True", "False", "Cannot say", "Partly true"].filter((item) => item !== correct));
    return { prompt: `Passage: “Revenue from ${product} rose ${rise}% in the quarter after the marketing campaign launched. Prices were also cut during the same quarter.” Statement: ${statement}`, options: o, answer, explanation: kind === "true" ? "The passage states the rise." : "A price cut happened at the same time, so causation cannot be concluded." };
  },
];

const PLAN: Section[] = ["numerical", "numerical", "numerical", "numerical", "logical", "logical", "logical", "logical", "verbal", "verbal", "verbal", "verbal"];

export function generateReasoningTest(seed: number): Item[] {
  const r = rng(seed);
  return PLAN.map((section, index) => {
    const bank = section === "numerical" ? NUMERICAL : section === "logical" ? LOGICAL : VERBAL;
    const item = bank[(index + Math.floor(r() * bank.length)) % bank.length](r);
    return { id: `${section}-${index + 1}`, section, ...item };
  });
}

export const publicItems = (items: Item[]): PublicItem[] => items.map(({ id, section, prompt, options }) => ({ id, section, prompt, options }));

export type ReasoningResult = { correct: number; total: number; percent: number; sections: Record<Section, { correct: number; total: number; percent: number }>; review: { id: string; correct: boolean; explanation: string }[] };

export function scoreReasoning(items: Item[], answers: Record<string, number>): ReasoningResult {
  const sections = { numerical: { correct: 0, total: 0, percent: 0 }, logical: { correct: 0, total: 0, percent: 0 }, verbal: { correct: 0, total: 0, percent: 0 } };
  const review = items.map((item) => {
    const correct = answers[item.id] === item.answer;
    sections[item.section].total += 1;
    if (correct) sections[item.section].correct += 1;
    return { id: item.id, correct, explanation: item.explanation };
  });
  for (const value of Object.values(sections)) value.percent = value.total ? Math.round((value.correct / value.total) * 100) : 0;
  const correct = review.filter((item) => item.correct).length;
  return { correct, total: items.length, percent: Math.round((correct / items.length) * 100), sections, review };
}
