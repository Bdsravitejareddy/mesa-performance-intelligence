// Parametric reasoning test. Items are generated from a seed, so every attempt is new and the server can
// regenerate the answer key to score a submission without ever sending answers to the browser.

export const REASONING_VERSION = "reasoning-v1";
export const REASONING_SECONDS = 12 * 60;
export type Level = "standard" | "hard" | "extreme";
export const LEVELS: Level[] = ["standard", "hard", "extreme"];
export const LEVEL_SECONDS: Record<Level, number> = { standard: 12 * 60, hard: 15 * 60, extreme: 18 * 60 };
// Versions carry the level, so a submission is always re-scored against the same generators.
export const versionFor = (level: Level) => (level === "standard" ? REASONING_VERSION : `reasoning-v2:${level}`);
export const levelOf = (version: string): Level => (version.startsWith("reasoning-v2:") ? (version.split(":")[1] as Level) : "standard");
export type Section = "numerical" | "logical" | "verbal";
export type Item = { id: string; section: Section; prompt: string; options: string[]; answer: number; explanation: string; difficulty?: number };
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
  // Too few distinct distractors: add near-miss numbers in the same format, never a visibly marked copy.
  const number = correct.match(/-?\d[\d,]*(?:\.\d+)?/);
  for (let step = 1; unique.length < 3 && step <= 12; step += 1) {
    const candidate = number ? correct.replace(number[0], (() => { const value = Number(number[0].replace(/,/g, "")); const decimals = number[0].split(".")[1]?.length ?? 0; const next = value + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * (decimals ? 10 ** -decimals * 5 : Math.max(1, Math.round(Math.abs(value) * 0.1))); return decimals ? next.toFixed(decimals) : fmt(next); })()) : `None of these (${step})`;
    if (candidate !== correct && !unique.includes(candidate)) unique.push(candidate);
  }
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
    const statement = kind === "true" ? `Revenue from ${product} was higher in the quarter after the campaign launched than before it.` : `The campaign caused the increase in revenue from ${product}.`;
    const correct = kind === "true" ? "True" : "Cannot say";
    const { options: o, answer } = options(r, correct, ["True", "False", "Cannot say", "Partly true"].filter((item) => item !== correct));
    return { prompt: `Passage: “Revenue from ${product} rose ${rise}% in the quarter after the marketing campaign launched. Prices were also cut during the same quarter.” Statement: ${statement}`, options: o, answer, explanation: kind === "true" ? "The statement only claims timing — revenue was higher afterwards — which the passage states. Whether the campaign or the price cut caused it is a different claim, and that one is “Cannot say”." : "A price cut happened at the same time, so causation cannot be concluded." };
  },
];

// ── Hard items: multi-step, with distractors built from the usual mistakes ───────────────────────────────
const pct1 = (value: number) => `${(Math.round(value * 10) / 10).toFixed(1)}%`;
const NUMERICAL_HARD = [
  (r: Rand) => {
    const start = int(r, 20, 80) * 10, years = pick(r, [3, 4, 5]), rate = pick(r, [8, 12, 15, 18, 22, 25]);
    const end = Math.round(start * (1 + rate / 100) ** years);
    const cagr = ((end / start) ** (1 / years) - 1) * 100;
    const simple = ((end - start) / start / years) * 100;
    const { options: o, answer } = options(r, pct1(cagr), [pct1(simple), pct1(((end - start) / start) * 100), pct1(cagr + 2.5)]);
    return { prompt: `Annual revenue grew from ₹${fmt(start)} lakh to ₹${fmt(end)} lakh over ${years} years. What is the compound annual growth rate (to one decimal)?`, options: o, answer, explanation: `(${fmt(end)} ÷ ${fmt(start)})^(1/${years}) − 1 = ${pct1(cagr)}. Dividing total growth by ${years} (${pct1(simple)}) ignores compounding.` };
  },
  (r: Rand) => {
    const base = pick(r, [1, 2, 4, 5]), sensitivity = pick(r, [80, 90, 95]), falsePositive = pick(r, [5, 8, 10]);
    const truePos = base * sensitivity, falsePos = (100 - base) * falsePositive;
    const posterior = (truePos / (truePos + falsePos)) * 100;
    const { options: o, answer } = options(r, `${Math.round(posterior)}%`, [`${sensitivity}%`, `${100 - falsePositive}%`, `${Math.round((truePos / (truePos + falsePos / 3)) * 100)}%`]);
    return { prompt: `${base}% of transactions are fraudulent. A fraud model flags ${sensitivity}% of fraudulent transactions and wrongly flags ${falsePositive}% of genuine ones. A transaction is flagged. What is the chance it is actually fraudulent (nearest %)?`, options: o, answer, explanation: `Per 10,000: true flags ${fmt(truePos)}, false flags ${fmt(falsePos)}; ${fmt(truePos)} ÷ ${fmt(truePos + falsePos)} = ${Math.round(posterior)}%. The model's ${sensitivity}% hit rate is not the answer, because genuine transactions vastly outnumber fraud.` };
  },
  (r: Rand) => {
    const arpu = int(r, 4, 12) * 50, margin = pick(r, [40, 50, 60, 70]), churn = pick(r, [2, 4, 5, 8]), cac = int(r, 6, 30) * 100;
    const ltv = (arpu * margin / 100) / (churn / 100);
    const ratio = Math.round((ltv / cac) * 10) / 10;
    const { options: o, answer } = options(r, `${ratio.toFixed(1)}×`, [`${(Math.round((arpu / (churn / 100) / cac) * 10) / 10).toFixed(1)}×`, `${(Math.round(((arpu * margin / 100) * 12 / cac) * 10) / 10).toFixed(1)}×`, `${(ratio + 1.5).toFixed(1)}×`]);
    return { prompt: `A subscription earns ₹${arpu} a month per customer at a ${margin}% gross margin. ${churn}% of customers leave each month, and acquiring one costs ₹${fmt(cac)}. What is the lifetime value to acquisition cost ratio (LTV:CAC, one decimal)?`, options: o, answer, explanation: `Monthly gross profit ₹${fmt(arpu * margin / 100)} ÷ churn ${churn}% = LTV ₹${fmt(ltv)}; ÷ CAC ₹${fmt(cac)} = ${ratio.toFixed(1)}×. Using revenue instead of gross profit overstates it.` };
  },
  (r: Rand) => {
    const shareA = pick(r, [40, 50, 60, 70]), marginA = pick(r, [20, 25, 30]), marginB = pick(r, [45, 50, 55, 60]), newShareA = shareA + pick(r, [10, 15, 20]);
    const before = (shareA * marginA + (100 - shareA) * marginB) / 100, after = (newShareA * marginA + (100 - newShareA) * marginB) / 100;
    const change = Math.round((after - before) * 10) / 10;
    const { options: o, answer } = options(r, `${change.toFixed(1)} points`, [`${(-change).toFixed(1)} points`, "0.0 points", `${(change / 2).toFixed(1)} points`]);
    return { prompt: `Product A (margin ${marginA}%) is ${shareA}% of revenue and product B (margin ${marginB}%) the rest. Next year A becomes ${newShareA}% of revenue, with both margins unchanged. How does the overall margin change?`, options: o, answer, explanation: `Before: ${before.toFixed(1)}%; after: ${after.toFixed(1)}%; change ${change.toFixed(1)} points. Neither margin moved — the mix shifted towards the lower-margin product.` };
  },
];

// Every ordering of up to five names; used to check that a set of clues has exactly one solution.
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}
const LOGICAL_HARD = [
  (r: Rand) => {
    const [a, b, c] = pick(r, [["auditors", "certified", "partners"], ["drones", "licensed", "imported"], ["founders", "engineers", "board members"]] as const);
    const kind = pick(r, ["no-some", "all-no"] as const);
    const premise = kind === "no-some" ? `No ${a} are ${b}. Some ${c} are ${a}.` : `All ${a} are ${b}. No ${c} are ${b}.`;
    const correct = kind === "no-some" ? `Some ${c} are not ${b}` : `No ${c} are ${a}`;
    const distractors = kind === "no-some" ? [`No ${c} are ${b}`, `Some ${c} are ${b}`, `All ${c} are ${b}`] : [`Some ${c} are ${a}`, `Some ${b} are ${c}`, `All ${b} are ${a}`];
    const { options: o, answer } = options(r, correct, distractors);
    return { prompt: `${premise} Which must be true?`, options: o, answer, explanation: kind === "no-some" ? `The ${c} who are ${a} cannot be ${b}, so at least some ${c} are not ${b}. Nothing is said about the other ${c}.` : `Every ${a} is ${b} and no ${c} is ${b}, so no ${c} can be one of the ${a}.` };
  },
  (r: Rand) => {
    const [x, y] = pick(r, [["Arjun", "Bela"], ["Kiran", "Lena"], ["Mira", "Nikhil"]] as const);
    const kind = pick(r, ["both", "atleast"] as const);
    const said = kind === "both" ? `“We are both liars.”` : `“At least one of us is a liar.”`;
    const correct = kind === "both" ? `${x} is a liar and ${y} tells the truth` : `${x} tells the truth and ${y} is a liar`;
    const { options: o, answer } = options(r, correct, [`Both tell the truth`, `Both are liars`, kind === "both" ? `${x} tells the truth and ${y} is a liar` : `${x} is a liar and ${y} tells the truth`]);
    return { prompt: `On an island, everyone either always tells the truth or always lies. ${x} says about ${x} and ${y}: ${said} What are they?`, options: o, answer, explanation: kind === "both" ? `A truth-teller could not say it (it would make them a liar), so ${x} lies; since “both liars” is false, ${y} must tell the truth.` : `If ${x} lied, “at least one is a liar” would be true — a contradiction. So ${x} tells the truth, and the liar must be ${y}.` };
  },
  (r: Rand) => {
    const a = int(r, 2, 9), d = int(r, 2, 6), x = int(r, 20, 40), e = -int(r, 1, 4);
    const series = [a, x, a + d, x + e, a + 2 * d, x + 2 * e, a + 3 * d];
    const correct = x + 3 * e;
    const { options: o, answer } = options(r, String(correct), [String(a + 4 * d), String(series[6] + d), String(x + 2 * e - 1)]);
    return { prompt: `What comes next? ${series.join(", ")}, …`, options: o, answer, explanation: `Two series alternate: ${a}, ${a + d}, ${a + 2 * d}… (+${d}) and ${x}, ${x + e}, ${x + 2 * e}… (${e}). The next term belongs to the second.` };
  },
  (r: Rand) => {
    const names = ["Asha", "Ben", "Chitra", "Dev", "Esha"];
    const order = [...names].sort(() => r() - 0.5);
    const position = (perm: string[], name: string) => perm.indexOf(name);
    type Clue = { text: string; holds: (perm: string[]) => boolean };
    const candidates: Clue[] = [];
    for (let i = 0; i < 5; i += 1) for (let j = 0; j < 5; j += 1) if (i !== j) {
      const [p, q] = [order[i], order[j]];
      if (i < j) candidates.push({ text: `${p} finished ahead of ${q}.`, holds: (perm) => position(perm, p) < position(perm, q) });
      if (j === i + 1) candidates.push({ text: `${p} finished immediately ahead of ${q}.`, holds: (perm) => position(perm, q) === position(perm, p) + 1 });
    }
    candidates.push({ text: `${order[4]} did not finish first.`, holds: (perm) => position(perm, order[4]) !== 0 });
    const clues: Clue[] = [];
    let remaining = permutations(names);
    for (const clue of candidates.sort(() => r() - 0.5)) {
      if (remaining.length === 1) break;
      const next = remaining.filter(clue.holds);
      if (next.length < remaining.length) { clues.push(clue); remaining = next; }
    }
    const target = int(r, 1, 3);
    const correct = order[target];
    const { options: o, answer } = options(r, correct, names.filter((name) => name !== correct).slice(0, 3));
    return { prompt: `Five people ran a race. ${clues.map((clue) => clue.text).join(" ")} Who finished ${["first", "second", "third", "fourth"][target]}?`, options: o, answer, explanation: `The clues allow only one order: ${order.join(", ")}.` };
  },
];

const VERBAL_HARD = [
  (r: Rand) => {
    const product = pick(r, ["the meal kit", "the fitness app", "the credit card"]), rise = int(r, 12, 35);
    const correct = "Revenue in a comparable region that had the same price cut but no campaign";
    const { options: o, answer } = options(r, correct, ["Revenue in the following quarter", "How many people saw the campaign's ads", "Customer satisfaction scores after the campaign"]);
    return { prompt: `Passage: “Revenue from ${product} rose ${rise}% in the quarter after a marketing campaign. Prices were also cut that quarter.” Which additional data would best show whether the campaign itself raised revenue?`, options: o, answer, explanation: "A comparison that holds the price cut constant and removes only the campaign isolates the campaign's effect. Reach or satisfaction data cannot separate the two causes." };
  },
  (r: Rand) => {
    const k = int(r, 1, 3);
    const [aEasy, aEasyN, bEasy, bEasyN] = [90 * k, 100 * k, 800 * k, 1000 * k];
    const [aHard, aHardN, bHard, bHardN] = [300 * k, 1000 * k, 20 * k, 100 * k];
    const [x, y] = pick(r, [["Branch A", "Branch B"], ["Agent team A", "Agent team B"]] as const);
    const correct = `${x} converts better in both segments; ${y}'s higher overall rate comes from handling mostly easy leads`;
    const { options: o, answer } = options(r, correct, [`${y} converts better, because its overall rate is higher`, `The two perform equally once totals are compared`, `${x} converts better overall`]);
    return { prompt: `Easy leads — ${x}: ${fmt(aEasy)} of ${fmt(aEasyN)} converted; ${y}: ${fmt(bEasy)} of ${fmt(bEasyN)}. Hard leads — ${x}: ${fmt(aHard)} of ${fmt(aHardN)}; ${y}: ${fmt(bHard)} of ${fmt(bHardN)}. Which conclusion is best supported?`, options: o, answer, explanation: `Within each segment ${x} is higher (90% vs 80%, 30% vs 20%), but ${x} handled mostly hard leads, so its overall rate (${Math.round(((aEasy + aHard) / (aEasyN + aHardN)) * 100)}%) is lower than ${y}'s (${Math.round(((bEasy + bHard) / (bEasyN + bHardN)) * 100)}%). This is Simpson's paradox.` };
  },
  (r: Rand) => {
    const [change, outcome] = pick(r, [["the app redesign", "weekly orders fell"], ["the new pricing page", "sign-ups dropped"], ["moving support to chat", "complaints rose"]] as const);
    const correct = `Nothing else that affects the outcome changed around the time of ${change}`;
    const { options: o, answer } = options(r, correct, [`${change[0].toUpperCase()}${change.slice(1)} was expensive`, `Customers were surveyed about ${change}`, `The same change worked well at a competitor`]);
    return { prompt: `Argument: “${outcome[0].toUpperCase()}${outcome.slice(1)} right after ${change}, so ${change} caused it.” Which assumption does the argument depend on?`, options: o, answer, explanation: "Concluding cause from timing assumes no other change (season, competitor, price, outage) explains the outcome. Remove that assumption and the argument fails." };
  },
  (r: Rand) => {
    const [x, y] = pick(r, [["more cafés", "higher average incomes"], ["more gyms", "lower obesity rates"], ["more co-working spaces", "more startups"]] as const);
    const correct = `${y[0].toUpperCase()}${y.slice(1)} attract ${x}, rather than the other way round`;
    const { options: o, answer } = options(r, correct, [`${x[0].toUpperCase()}${x.slice(1)} directly create ${y}`, "The sample of cities was too large", `${y[0].toUpperCase()}${y.slice(1)} are unrelated to ${x}`]);
    return { prompt: `Cities with ${x} have ${y}. A report concludes that opening ${x} will produce ${y}. Which is the strongest alternative explanation?`, options: o, answer, explanation: "Reverse causation: the outcome may draw in the cause. A correlation alone cannot tell the direction." };
  },
];

const BANKS: Record<Section, { easy: typeof NUMERICAL; hard: typeof NUMERICAL }> = {
  numerical: { easy: NUMERICAL, hard: NUMERICAL_HARD },
  logical: { easy: LOGICAL, hard: LOGICAL_HARD },
  verbal: { easy: VERBAL, hard: VERBAL_HARD },
};
// Design difficulty on a logit scale (Rasch b): used to adjust the score for how hard the items were.
const EASY_B = -1, HARD_B = 1.5;

export function generateLeveledTest(seed: number, level: Level): Item[] {
  if (level === "standard") return generateReasoningTest(seed).map((item) => ({ ...item, difficulty: EASY_B }));
  const r = rng(seed);
  // Each question type appears at most once per test: banks are shuffled and drawn in order.
  const decks = Object.fromEntries((Object.keys(BANKS) as Section[]).flatMap((section) => (["easy", "hard"] as const).map((tier) => [`${section}:${tier}`, [...BANKS[section][tier]].sort(() => r() - 0.5)]))) as Record<string, typeof NUMERICAL>;
  return PLAN.map((section, index) => {
    // Hard mixes harder and standard items one to one; extreme uses only the harder bank.
    const useHard = level === "extreme" || index % 2 === 1;
    const deck = decks[`${section}:${useHard ? "hard" : "easy"}`];
    const item = (deck.shift() ?? BANKS[section][useHard ? "hard" : "easy"][0])(r);
    return { id: `${section}-${index + 1}`, section, ...item, difficulty: useHard ? HARD_B : EASY_B };
  });
}

// Ability on the items' difficulty scale (Rasch model, with a standard-normal prior so a perfect or zero score
// stays finite). It adjusts for how hard the questions were; it is not a comparison with other people.
export function abilityEstimate(items: Item[], correct: boolean[]): { theta: number; scaled: number } {
  let theta = 0;
  for (let step = 0; step < 40; step += 1) {
    let gradient = -theta, information = 1;
    items.forEach((item, index) => { const p = 1 / (1 + Math.exp(-(theta - (item.difficulty ?? 0)))); gradient += (correct[index] ? 1 : 0) - p; information += p * (1 - p); });
    theta += gradient / information;
  }
  const rounded = Math.round(theta * 100) / 100;
  // 50 = an even chance on a medium item (b = 0); each logit is 15 points. Bounded to 0–100.
  return { theta: rounded, scaled: Math.max(0, Math.min(100, Math.round(50 + 15 * theta))) };
}

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

export type ReasoningResult = { correct: number; total: number; percent: number; sections: Record<Section, { correct: number; total: number; percent: number }>; review: { id: string; correct: boolean; explanation: string; prompt?: string; chosen?: string | null; key?: string }[]; level?: Level; ability?: { theta: number; scaled: number } };

export function scoreReasoning(items: Item[], answers: Record<string, number>): ReasoningResult {
  const sections = { numerical: { correct: 0, total: 0, percent: 0 }, logical: { correct: 0, total: 0, percent: 0 }, verbal: { correct: 0, total: 0, percent: 0 } };
  const review = items.map((item) => {
    const correct = answers[item.id] === item.answer;
    sections[item.section].total += 1;
    if (correct) sections[item.section].correct += 1;
    return { id: item.id, correct, explanation: item.explanation, prompt: item.prompt, chosen: answers[item.id] === undefined ? null : item.options[answers[item.id]] ?? null, key: item.options[item.answer] };
  });
  for (const value of Object.values(sections)) value.percent = value.total ? Math.round((value.correct / value.total) * 100) : 0;
  const correct = review.filter((item) => item.correct).length;
  const graded = items.some((item) => item.difficulty !== undefined) ? { ability: abilityEstimate(items, review.map((item) => item.correct)) } : {};
  return { correct, total: items.length, percent: Math.round((correct / items.length) * 100), sections, review, ...graded };
}
