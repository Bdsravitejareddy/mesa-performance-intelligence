import { FACTOR_LABELS, type Factor } from "@/lib/tests/personality";
import { FACTOR_RESEARCH } from "@/lib/tests/research";
import type { Glance } from "./glance";
import { NEO_TRAITS, type IpipNeo, type NeoTrait } from "@/lib/tests/ipip-neo";

// What the personality, context, reasoning and behaviour results add up to, in plain words. Deterministic:
// every sentence names the figures it rests on, and the research it cites is population-level.
export type NetSummary = { headline: string; points: { title: string; text: string; cite?: string[] }[]; open: string | null };

const level = (score: number) => (score >= 4 ? "high" : score <= 2 ? "low" : "moderate");
// Neuroticism reads more naturally as its opposite pole when low.
const traitPhrase = (factor: Factor, score: number) => factor === "neuroticism"
  ? score <= 2 ? "emotionally steady" : score >= 4 ? "quick to feel stress" : "moderately reactive to stress"
  : `${level(score)} in ${FACTOR_LABELS[factor].split(" ")[0].toLowerCase()}`;

const NEO_OF: Record<Factor, NeoTrait> = { extraversion: "extraversion", agreeableness: "agreeableness", conscientiousness: "conscientiousness", neuroticism: "neuroticism", intellect: "openness" };
const ordinal = (value: number) => `${value}${value % 100 >= 11 && value % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
const band = (percentile: number) => (percentile >= 90 ? "very high" : percentile >= 70 ? "high" : percentile > 30 ? "around average" : percentile > 10 ? "low" : "very low");
// A trait read against the comparison group: neuroticism reads as its opposite pole, as elsewhere on the page.
function neoPhrase(trait: NeoTrait, percentile: number): string {
  if (trait === "neuroticism") return percentile <= 30 ? `unusually steady under stress (${ordinal(percentile)} percentile for neuroticism)` : percentile >= 70 ? `quicker to feel stress than most (${ordinal(percentile)} percentile)` : `about as reactive to stress as most (${ordinal(percentile)} percentile)`;
  return `${band(percentile)} in ${NEO_TRAITS.find((item) => item.key === trait)!.label.toLowerCase()} (${ordinal(percentile)} percentile)`;
}

// Within one trait, facets well above and around or below the rest: a split that can explain why two readings of the
// trait differ. Facets the report itself states inconsistently are left out.
function facetSplit(neo: IpipNeo, trait: NeoTrait): { high: string[]; middle: string[]; doubtful: string[] } | null {
  const facets = neo.facets.filter((facet) => facet.trait === trait && facet.percentile !== null);
  const doubtful = facets.filter((facet) => neo.anomalies.some((note) => note.startsWith(`${facet.name} `))).map((facet) => facet.name);
  const usable = facets.filter((facet) => !doubtful.includes(facet.name));
  const high = usable.filter((facet) => facet.percentile! >= 75).map((facet) => `${facet.name} (${facet.percentile}%)`);
  const middle = usable.filter((facet) => facet.percentile! <= 60).map((facet) => `${facet.name} (${facet.percentile}%)`);
  return high.length && middle.length ? { high, middle, doubtful } : null;
}

export function netSummary(glance: Glance): NetSummary {
  const points: NetSummary["points"] = [];
  let headline = "Take the questionnaire and a reasoning test to build this summary.";
  let open: string | null = null;

  if (glance.self) {
    const ranked = (Object.entries(glance.self) as [Factor, number][]).sort((a, b) => Math.abs(b[1] - 3) - Math.abs(a[1] - 3));
    const top = ranked.slice(0, 3);
    headline = `You describe yourself as ${top.map(([factor, score]) => traitPhrase(factor, score)).join(", ")}.`;
    // With a long-form result and its percentiles, what is distinctive is how far a trait sits from other people, not
    // from the middle of the answer scale.
    const neo = glance.external.neo;
    if (neo && NEO_TRAITS.every(({ key }) => neo.traits[key].percentile !== null)) {
      const byPercentile = NEO_TRAITS.map(({ key }) => [key, neo.traits[key].percentile!] as const).sort((a, b) => Math.abs(b[1] - 50) - Math.abs(a[1] - 50));
      headline = `On the ${neo.form}, you describe yourself as ${byPercentile.slice(0, 3).map(([trait, percentile]) => neoPhrase(trait, percentile)).join(", ")}.`;
    }
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
      const split = biggest && Math.abs(biggest.gap) >= 0.75 && glance.external.neo ? facetSplit(glance.external.neo, NEO_OF[biggest.factor]) : null;
      if (split && glance.external.neo) {
        const trait = FACTOR_LABELS[biggest.factor].split(" (")[0].toLowerCase();
        points.push({
          title: `What your facets say about ${trait}`,
          text: `Your ${glance.external.neo.form} splits ${trait}: high in ${split.high.join(", ")}; around average in ${split.middle.join(", ")}.${split.doubtful.length ? ` (${split.doubtful.join(", ")} left out: the report states it inconsistently.)` : ""} That fits both readings — the questionnaire picks up the high facets, your writing the average ones — so the gap is about which side of the trait shows, not a contradiction.`,
        });
        open = `Which side of your ${trait} do the people you work with notice — ${split.high[0].replace(/ \(.*$/, "").toLowerCase()} or ${split.middle[0].replace(/ \(.*$/, "").toLowerCase()}? Their feedback would show which one shows at work.`;
      } else if (biggest && Math.abs(biggest.gap) >= 0.75) open = `Is your ${FACTOR_LABELS[biggest.factor].split(" (")[0].toLowerCase()} closer to ${glance.self[biggest.factor].toFixed(1)} (how you answered) or ${glance.context.factors[biggest.factor].score!.toFixed(1)} (how you write about yourself)? Feedback from people who work with you would settle it.`;
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
