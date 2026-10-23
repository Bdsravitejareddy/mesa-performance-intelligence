import Link from "next/link";
import { Radar } from "@/components/radar";
import { FACTORS, type Glance } from "@/lib/profile/glance";

const SHORT: Record<string, string> = { extraversion: "Extraversion", agreeableness: "Agreeableness", conscientiousness: "Conscientious-\nness", neuroticism: "Emotional\nstability", intellect: "Intellect" };

// Three infographics on the overview: personality, reasoning and skills. Each is drawn only from measured
// figures, and links to the page that explains it.
export function ProfileGlance({ glance }: { glance: Glance }) {
  const personality = FACTORS.map((factor) => { const score = glance.self?.[factor]; return score === undefined ? null : factor === "neuroticism" ? 6 - score : score; });
  const context = FACTORS.map((factor) => { const score = glance.context?.factors[factor]?.score; return score === null || score === undefined ? null : factor === "neuroticism" ? 6 - score : score; });
  const skills = glance.skills.filter((row) => row.score !== null);
  if (!glance.self && !glance.reasoning.length && skills.length < 3) return null;
  return <section className="profile-glance" aria-label="Profile at a glance">
    <div className="panel-head"><span className="eyebrow"><span className="eyebrow-line" /> Profile at a glance</span><Link href="/tests" className="text-link">What it means →</Link></div>
    <div className="radar-grid">
      {glance.self && <Radar title="Personality" axes={FACTORS.map((factor) => SHORT[factor])} max={5} series={[{ label: "How you answered", tone: "rose", values: personality }, { label: "Your context", tone: "dusk", values: context }]} caption="Self-report on the 1–5 IPIP scale, beside a reading of what you have written." />}
      {glance.reasoning.length > 0 && <Radar title="Foundational reasoning" axes={["Numerical", "Logical", "Verbal"]} max={100} rings={4} series={glance.reasoning.map((row, index) => ({ label: `${row.level[0].toUpperCase()}${row.level.slice(1)}`, tone: (["gold", "rose", "moss"] as const)[index % 3], values: [row.sections.numerical, row.sections.logical, row.sections.verbal] }))} caption="% correct on your latest attempt at each difficulty." />}
      {skills.length >= 3 && <Radar title="Skills from coursework" axes={glance.skills.map((row) => row.domain.replace(/ & /, " &\n"))} max={100} rings={4} series={[{ label: "Average mark", tone: "moss", values: glance.skills.map((row) => row.score) }]} caption="Average official mark on assessments mapped to each skill domain." />}
    </div>
  </section>;
}
