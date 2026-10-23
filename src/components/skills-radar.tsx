import { Radar } from "@/components/radar";
import { Why } from "@/components/why";
import type { SkillView } from "@/lib/profile/skills";

// The three views of each skill domain on one chart, with how each line is built.
export function SkillsRadar({ skills, aiDate }: { skills: SkillView[]; aiDate: string | null }) {
  if (skills.filter((row) => row.marked !== null || row.ai?.score != null).length < 3) return null;
  return <div className="skills-radar">
    <Radar title="Skills" axes={skills.map((row) => row.domain.replace(/ & /, " &\n"))} max={100} rings={4} series={[
      { label: "Marked", tone: "moss", values: skills.map((row) => row.marked) },
      { label: "AI view", tone: "dusk", values: skills.map((row) => row.ai?.score ?? null) },
      { label: "Holistic", tone: "gold", values: skills.map((row) => row.holistic) },
    ]} caption="Marked: grades and graded submissions · AI view: the AI's reading of all your evidence · Holistic: both together." />
    <Why label="How each line is built">
      <p><b>Marked</b> — official Mesa marks, plus blind AI grades of your submitted work where no official mark exists yet (graded on meaning against the brief and course, not keywords). Term exams count three times practice work; AI grades count a little less than official marks.</p>
      <p><b>AI view</b> — the AI reads everything: graded work, faculty feedback, your projects, your own AI conversations (if included), reasoning tests and your self-report. Every domain score must quote its evidence; assistant profiles alone never count.{aiDate ? ` Last run ${new Date(aiDate).toLocaleDateString()}.` : " Not run yet — it runs in the next refresh."}</p>
      <p><b>Holistic</b> — marked and AI views together, the marked view weighted more as its evidence grows, the AI view by its confidence, and reasoning tests adding to analytical reasoning. A domain with no evidence in any view stays blank.</p>
      <ul className="reason-list">{skills.filter((row) => row.ai?.score != null).map((row) => <li key={row.domain}><b>{row.domain}</b> (AI {row.ai!.score}, {row.ai!.confidence}): {row.ai!.reason}{row.ai!.quotes[0] && <> <q>{row.ai!.quotes[0].quote}</q></>}</li>)}</ul>
    </Why>
  </div>;
}
