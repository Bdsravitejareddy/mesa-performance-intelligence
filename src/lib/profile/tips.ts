import type { Factor } from "@/lib/tests/personality";
import type { Glance } from "./glance";
import type { NeoTrait } from "@/lib/tests/ipip-neo";

// Tips tied to your personality, shown only when they are well supported, and resting on a replicated, peer-reviewed
// trait–outcome link. The trait must be clearly high or low either on a long-form Big Five result with percentiles
// (25th percentile or below, 75th or above), or in your short questionnaire answers AND your written context. The
// short questionnaire alone is too brief to stand on its own. Effects in this research are modest; the tips say so.
export type Tip = { trait: string; tip: string; finding: string; studies: string[]; basis: string };

type Rule = { factor: Factor; pole: "high" | "low"; trait: string; tip: string; finding: string; studies: string[] };
const RULES: Rule[] = [
  { factor: "conscientiousness", pole: "high", trait: "Highly conscientious", tip: "Plan your week in writing and track it — structure is where you perform best. Build in one review point to change plans when evidence shifts, so planning does not turn rigid.", finding: "Conscientiousness is the most consistent trait correlate of job and academic performance across studies.", studies: ["barrick1991", "poropat2009"] },
  { factor: "intellect", pole: "high", trait: "High in intellect", tip: "Choose stretch work in unfamiliar areas, and turn each idea into a tested output (a prototype, a memo with numbers) so curiosity shows up as results.", finding: "Openness/intellect relates to learning new material in training, and modestly to academic performance.", studies: ["barrick1991", "poropat2009"] },
  { factor: "neuroticism", pole: "low", trait: "Emotionally steady", tip: "Volunteer for high-pressure moments — presenting, negotiating, deadline-heavy roles — where steadiness is visible to others.", finding: "Emotional stability relates to leadership and steadier performance under pressure.", studies: ["judge2002"] },
  { factor: "extraversion", pole: "high", trait: "Extraverted", tip: "Take the speaking and facilitation roles in group work; it is the trait most linked to being seen as a leader.", finding: "Extraversion is the strongest trait correlate of leadership emergence.", studies: ["judge2002"] },
  { factor: "agreeableness", pole: "high", trait: "Highly agreeable", tip: "Lean into team-facing and client-facing work, and practise stating a firm view first, so harmony does not cost you your position.", finding: "Agreeableness predicts performance mainly in work built on cooperation and teamwork.", studies: ["mount1998"] },
];

const level = (score: number) => (score >= 4 ? "high" : score <= 2 ? "low" : "middle");

const NEO_OF: Record<Factor, NeoTrait> = { extraversion: "extraversion", agreeableness: "agreeableness", conscientiousness: "conscientiousness", neuroticism: "neuroticism", intellect: "openness" };

export function personalityTips(glance: Pick<Glance, "self" | "context"> & { external?: Pick<Glance["external"], "neo"> }): Tip[] {
  const neo = glance.external?.neo ?? null;
  return RULES.flatMap((rule) => {
    const percentile = neo?.traits[NEO_OF[rule.factor]]?.percentile ?? null;
    if (percentile !== null) {
      const pole = percentile >= 75 ? "high" : percentile <= 25 ? "low" : "middle";
      return pole === rule.pole ? [{ ...pick(rule), basis: `${neo!.form}: ${ordinal(percentile)} percentile` }] : [];
    }
    if (!glance.self || !glance.context) return [];
    const self = glance.self[rule.factor];
    const context = glance.context.factors[rule.factor]?.score;
    return level(self) === rule.pole && context !== null && context !== undefined && level(context) === rule.pole ? [{ ...pick(rule), basis: "Your questionnaire answers and your written context agree" }] : [];
  });
}

const ordinal = (value: number) => `${value}${value % 100 >= 11 && value % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
const pick = ({ trait, tip, finding, studies }: Rule) => ({ trait, tip, finding, studies });
