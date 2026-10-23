import Link from "next/link";
import { Radar } from "@/components/radar";
import { SkillsRadar } from "@/components/skills-radar";
import { FACTORS, type Glance } from "@/lib/profile/glance";
import { personalityTips } from "@/lib/profile/tips";
import { STUDIES } from "@/lib/tests/research";
import { Why } from "@/components/why";

const SHORT: Record<string, string> = { extraversion: "Extraversion", agreeableness: "Agreeableness", conscientiousness: "Conscientious-\nness", neuroticism: "Emotional\nstability", intellect: "Intellect" };

// Three infographics on the overview: personality, reasoning and skills. Each is drawn only from measured
// figures, and links to the page that explains it.
export function ProfileGlance({ glance }: { glance: Glance }) {
  const personality = FACTORS.map((factor) => { const score = glance.self?.[factor]; return score === undefined ? null : factor === "neuroticism" ? 6 - score : score; });
  const context = FACTORS.map((factor) => { const score = glance.context?.factors[factor]?.score; return score === null || score === undefined ? null : factor === "neuroticism" ? 6 - score : score; });
  const skills = glance.skills.filter((row) => row.marked !== null || row.ai?.score != null);
  if (!glance.self && !glance.reasoning.length && skills.length < 3) return null;
  const tips = personalityTips(glance);
  return <section className="profile-glance" aria-label="Profile at a glance">
    <div className="panel-head"><span className="eyebrow"><span className="eyebrow-line" /> Profile at a glance</span><Link href="/tests" className="text-link">What it means →</Link></div>
    {tips.length > 0 && <div className="tips-panel">
      <h2>Tips for you</h2>
      <p className="empty-hint">Only for traits where your questionnaire answers and your written context agree, and only where peer-reviewed research shows a replicated link. These links are real but modest in size — patterns across many people, not guarantees for you.</p>
      <div className="tips-grid">{tips.map((tip) => <article key={tip.trait} className="tip-card"><span className="brief-kind">{tip.trait}</span><p>{tip.tip}</p><Why label="The research"><p>{tip.finding}</p><ul className="cite-list">{tip.studies.map((key) => { const study = STUDIES.find((item) => item.key === key); return study ? <li key={key}><small><a href={study.url} target="_blank" rel="noreferrer">{study.citation}</a></small></li> : null; })}</ul></Why></article>)}</div>
    </div>}
    <div className="radar-grid">
      {glance.self && <Radar title="Personality" axes={FACTORS.map((factor) => SHORT[factor])} max={5} series={[{ label: "How you answered", tone: "rose", values: personality }, { label: "Your context", tone: "dusk", values: context }]} caption="Self-report on the 1–5 IPIP scale, beside a reading of what you have written." />}
      {glance.reasoning.length > 0 && <Radar title="Foundational reasoning" axes={["Numerical", "Logical", "Verbal"]} max={100} rings={4} series={glance.reasoning.map((row, index) => ({ label: `${row.level[0].toUpperCase()}${row.level.slice(1)}`, tone: (["gold", "rose", "moss"] as const)[index % 3], values: [row.sections.numerical, row.sections.logical, row.sections.verbal] }))} caption="% correct on your latest attempt at each difficulty." />}
      {skills.length >= 3 && <SkillsRadar skills={glance.skills} aiDate={glance.aiViewDate} />}
    </div>
  </section>;
}
