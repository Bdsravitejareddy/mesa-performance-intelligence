import type { Factor } from "@/lib/tests/personality";
import type { Glance } from "./glance";

// Tips tied to your personality, shown only when they are well supported: the trait must be clearly high or low
// in your answers AND your written context must agree, and the tip must rest on a replicated, peer-reviewed
// trait–outcome link. Effects in this research are modest; the tips say so rather than overstate them.
export type Tip = { trait: string; tip: string; finding: string; studies: string[] };

type Rule = { factor: Factor; pole: "high" | "low"; trait: string; tip: string; finding: string; studies: string[] };
const RULES: Rule[] = [
  { factor: "conscientiousness", pole: "high", trait: "Highly conscientious", tip: "Plan your week in writing and track it — structure is where you perform best. Build in one review point to change plans when evidence shifts, so planning does not turn rigid.", finding: "Conscientiousness is the most consistent trait correlate of job and academic performance across studies.", studies: ["barrick1991", "poropat2009"] },
  { factor: "intellect", pole: "high", trait: "High in intellect", tip: "Choose stretch work in unfamiliar areas, and turn each idea into a tested output (a prototype, a memo with numbers) so curiosity shows up as results.", finding: "Openness/intellect relates to learning new material in training, and modestly to academic performance.", studies: ["barrick1991", "poropat2009"] },
  { factor: "neuroticism", pole: "low", trait: "Emotionally steady", tip: "Volunteer for high-pressure moments — presenting, negotiating, deadline-heavy roles — where steadiness is visible to others.", finding: "Emotional stability relates to leadership and steadier performance under pressure.", studies: ["judge2002"] },
  { factor: "extraversion", pole: "high", trait: "Extraverted", tip: "Take the speaking and facilitation roles in group work; it is the trait most linked to being seen as a leader.", finding: "Extraversion is the strongest trait correlate of leadership emergence.", studies: ["judge2002"] },
  { factor: "agreeableness", pole: "high", trait: "Highly agreeable", tip: "Lean into team-facing and client-facing work, and practise stating a firm view first, so harmony does not cost you your position.", finding: "Agreeableness predicts performance mainly in work built on cooperation and teamwork.", studies: ["mount1998"] },
];

const level = (score: number) => (score >= 4 ? "high" : score <= 2 ? "low" : "middle");

export function personalityTips(glance: Pick<Glance, "self" | "context">): Tip[] {
  if (!glance.self || !glance.context) return [];
  return RULES.filter((rule) => {
    const self = glance.self![rule.factor];
    const context = glance.context!.factors[rule.factor]?.score;
    return level(self) === rule.pole && context !== null && context !== undefined && level(context) === rule.pole;
  }).map(({ trait, tip, finding, studies }) => ({ trait, tip, finding, studies }));
}
