import { generateLeveledTest, rng, type Item } from "@/lib/tests/reasoning";

// One practice set per week. Quiz and trick questions come from the verified reasoning generators, so every
// answer key is computed, never guessed; the case task targets the weakest skill; conversational prompts are
// everyday topics that show vocabulary and expression in writing (speech is not captured).
export type PracticeItem =
  | { id: string; kind: "quiz" | "trick"; prompt: string; options: string[] }
  | { id: string; kind: "case"; prompt: string; focus: string; minWords: number }
  | { id: string; kind: "conversation"; prompt: string; minWords: number };

export function weekStart(date: Date): string {
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

const CASES: Record<string, string[]> = {
  "Execution": ["A product launch slipped two weeks because a supplier missed a deadline. In about 150 words, set out what you would do in the next five days, in order, and why that order.", "You have three tasks due Friday and time for two. Pick two, explain what you drop and how you limit the damage."],
  "Communication": ["Explain to a non-specialist manager, in about 150 words, why last quarter's revenue rose but profit fell. Lead with the conclusion.", "Rewrite this in three clear sentences for a client: “Due to a confluence of operational factors, timelines have been impacted and deliverables are subject to change.”"],
  "Analytical reasoning": ["Sign-ups rose 20% the month a new landing page went live. List three other explanations, and the one piece of data that would best separate them.", "A café's sales are up 10% but customers are down 5%. What must be true, and what would you check next?"],
  "Business acumen": ["A subscription app wants to cut its price by 30% to grow users. In about 150 words, what has to be true for this to raise profit?", "Two products earn the same revenue; one has a 20% margin, one 55%. Which would you grow first, and what would change your mind?"],
  "Decision-making": ["You must choose between two vendors with incomplete data: one cheaper, one more reliable. Write the decision you would make, the risk you accept, and what would make you switch.", "State a decision you would make today with 60% of the information, and what you would do to protect against being wrong."],
  "Product thinking": ["Pick an app you use daily. Name one user problem it does not solve, who has it, and the smallest feature that would test whether solving it matters.", "A team wants to add five features. Describe how you would decide which one to build first, using one metric."],
  "Leadership": ["A teammate keeps missing deadlines and others are frustrated. In about 150 words, describe how you would handle the next conversation.", "Your group disagrees on the direction of a project two days before it is due. How do you reach a decision without losing anyone?"],
  "Technical capability": ["Describe, step by step in plain words, how you would find the five customers who spent the most last month from a table of orders.", "Explain to a beginner what an API is, using an everyday analogy, in about 100 words."],
  "Creativity": ["Give three unusual ways a bookshop could earn revenue without selling more books, and pick the one you would test first.", "Invent a product for people who commute by train, describe it in two sentences, and name its biggest risk."],
  "Learning agility": ["Describe something you learned recently that changed how you work, and what you now do differently.", "Pick a skill you know little about. Outline how you would get to a working level in two weeks."],
};
const CONVERSATION = [
  "Describe a place you would love to show a friend, and what you would do there.", "What is a small thing that reliably improves your day, and why?", "Tell the story of a meal you still remember.",
  "If you could master one hobby overnight, which would it be and what would you do first?", "Describe a book, film or song that changed your mind about something.", "What does a perfect weekend look like for you?",
  "Talk about someone who taught you something without meaning to.", "Describe the city or town you grew up in to someone who has never been there.", "What is a tradition you would like to keep, or start?",
  "Tell me about a time you got lost, and how you found your way.", "If you had a free afternoon tomorrow, how would you spend it?", "What is something you changed your mind about in the last year?",
];

export function buildWeek(seed: number, focus: string): { items: PracticeItem[]; key: Record<string, number>; explanations: Record<string, string> } {
  const r = rng(seed);
  const hard = generateLeveledTest(seed, "extreme");
  const pick = (section: Item["section"], count: number) => hard.filter((item) => item.section === section).slice(0, count);
  const quiz = [...pick("numerical", 2), ...pick("logical", 1)];
  const trick = pick("verbal", 2); // causal claims, Simpson's paradox, hidden assumptions, reverse causation
  const items: PracticeItem[] = [
    ...quiz.map((item, index) => ({ id: `q${index + 1}`, kind: "quiz" as const, prompt: item.prompt, options: item.options })),
    ...trick.map((item, index) => ({ id: `t${index + 1}`, kind: "trick" as const, prompt: item.prompt, options: item.options })),
  ];
  const key: Record<string, number> = {}, explanations: Record<string, string> = {};
  [...quiz, ...trick].forEach((item, index) => { const id = index < quiz.length ? `q${index + 1}` : `t${index - quiz.length + 1}`; key[id] = item.answer; explanations[id] = item.explanation; });
  const cases = CASES[focus] ?? CASES["Analytical reasoning"];
  items.push({ id: "case", kind: "case", prompt: cases[Math.floor(r() * cases.length)], focus: CASES[focus] ? focus : "Analytical reasoning", minWords: 80 });
  const first = Math.floor(r() * CONVERSATION.length);
  items.push({ id: "c1", kind: "conversation", prompt: CONVERSATION[first], minWords: 60 }, { id: "c2", kind: "conversation", prompt: CONVERSATION[(first + 5) % CONVERSATION.length], minWords: 60 });
  return { items, key, explanations };
}

// Plain measures of written expression: length, vocabulary range and sentence length. Descriptive only.
export function expression(text: string): { words: number; distinctShare: number; avgSentence: number; longWords: number } {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const sentences = text.split(/[.!?]+\s/).filter((part) => part.trim()).length || 1;
  // Distinct-word share over the first 100 words, so longer answers are not penalised for repeating function words.
  const sample = words.slice(0, 100);
  return { words: words.length, distinctShare: sample.length ? Math.round((new Set(sample).size / sample.length) * 100) / 100 : 0, avgSentence: Math.round((words.length / sentences) * 10) / 10, longWords: words.filter((word) => word.length >= 9).length };
}
