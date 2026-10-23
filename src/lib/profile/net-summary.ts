import { FACTOR_LABELS, type Factor } from "@/lib/tests/personality";
import { FACTOR_RESEARCH } from "@/lib/tests/research";
import type { Glance } from "./glance";

// What the personality, context, reasoning and behaviour results add up to, in plain words. Deterministic:
// every sentence names the figures it rests on, and the research it cites is population-level.
export type NetSummary = { headline: string; points: { title: string; text: string; cite?: string[] }[]; open: string | null };

const level = (score: number) => (score >= 4 ? "high" : score <= 2 ? "low" : "moderate");
// Neuroticism reads more naturally as its opposite pole when low.
const traitPhrase = (factor: Factor, score: number) => factor === "neuroticism"
  ? score <= 2 ? "emotionally steady" : score >= 4 ? "quick to feel stress" : "moderately reactive to stress"
  : `${level(score)} in ${FACTOR_LABELS[factor].split(" ")[0].toLowerCase()}`;

export function netSummary(glance: Glance): NetSummary {
  const points: NetSummary["points"] = [];
  let headline = "Take the questionnaire and a reasoning test to build this summary.";
  let open: string | null = null;

  if (glance.self) {
    const ranked = (Object.entries(glance.self) as [Factor, number][]).sort((a, b) => Math.abs(b[1] - 3) - Math.abs(a[1] - 3));
    const top = ranked.slice(0, 3);
    headline = `You describe yourself as ${top.map(([factor, score]) => traitPhrase(factor, score)).join(", ")}.`;
    // What the research links your most pronounced traits to.
    const notable = ranked.filter(([factor, score]) => (factor === "neuroticism" ? score <= 2.5 : score >= 3.5)).slice(0, 2);
    if (notable.length) points.push({
      title: "What research links this to",
      text: notable.map(([factor]) => `${FACTOR_LABELS[factor].split(" (")[0]}: ${FACTOR_RESEARCH[factor].strengths}`).join(" "),
      cite: [...new Set(notable.flatMap(([factor]) => FACTOR_RESEARCH[factor].studies))],
    });
    if (glance.context) {
      const compared = (Object.keys(glance.self) as Factor[]).filter((factor) => glance.context!.factors[factor]?.score !== null && glance.context!.factors[factor]?.score !== undefined);
      const gaps = compared.map((factor) => ({ factor, gap: glance.context!.factors[factor].score! - glance.self![factor] })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
      const agree = gaps.filter((item) => Math.abs(item.gap) < 0.75).length;
      const biggest = gaps[0];
      points.push({
        title: "Self-report against your written context",
        text: compared.length
          ? `Your note and assistant profiles agree with how you answered on ${agree} of ${compared.length} traits.${biggest && Math.abs(biggest.gap) >= 0.75 ? ` The largest difference is ${FACTOR_LABELS[biggest.factor].split(" (")[0].toLowerCase()}: you rated ${glance.self[biggest.factor].toFixed(1)}, your context reads ${glance.context.factors[biggest.factor].score!.toFixed(1)} — ${glance.context.factors[biggest.factor].reason}` : ""}`
          : "Your written context says too little about specific traits to compare yet.",
      });
      if (biggest && Math.abs(biggest.gap) >= 0.75) open = `Is your ${FACTOR_LABELS[biggest.factor].split(" (")[0].toLowerCase()} closer to ${glance.self[biggest.factor].toFixed(1)} (how you answered) or ${glance.context.factors[biggest.factor].score!.toFixed(1)} (how you write about yourself)? Feedback from people who work with you would settle it.`;
    }
  }

  if (glance.reasoning.length) {
    const best = glance.reasoning[glance.reasoning.length - 1];
    const sections = Object.entries(best.sections).sort((a, b) => b[1] - a[1]);
    const ceiling = best.level === "standard" && best.correct >= best.total - 1;
    points.push({
      title: "Reasoning",
      text: `${best.correct}/${best.total} on the ${best.level} test${best.scaled !== null ? ` (difficulty-adjusted ${best.scaled})` : ""}; strongest ${sections[0][0]} (${sections[0][1]}%), weakest ${sections[2][0]} (${sections[2][1]}%).${ceiling ? " That is at the test's ceiling, so it shows you clear the standard level but not how far above it you are — the Extreme level measures that." : ""}`,
    });
  }

  if (glance.behaviour.total) {
    const observed = glance.behaviour.dimensions.filter((row) => row.status === "observed");
    points.push({
      title: "Observed in your work",
      text: observed.length
        ? `${observed.length} of ${glance.behaviour.total} thinking patterns are visible in your coursework and feedback — most clearly ${observed.slice(0, 2).map((row) => row.dimension.toLowerCase()).join(" and ")}. The rest have no evidence yet, which is missing data, not a weakness.`
        : "No thinking pattern is evidenced in coursework or feedback yet.",
    });
  }
  return { headline, points, open };
}
