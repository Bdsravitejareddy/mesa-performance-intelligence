"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Rubric } from "@/lib/settings/rubric";

type Field = { path: string; label: string; help: string; min: number; max: number; step: number };
const GROUPS: { title: string; intro: string; fields: Field[] }[] = [
  { title: "How much each kind of work counts", intro: "Multipliers applied on top of each assessment's maximum marks.", fields: [
    { path: "stakes.exam", label: "Term exams", help: "Mid-terms, end-terms and graded final submissions.", min: 0, max: 10, step: 0.5 },
    { path: "stakes.graded", label: "Other graded work", help: "Quizzes and named graded assignments.", min: 0, max: 10, step: 0.5 },
    { path: "stakes.practice", label: "Practice work", help: "Async tasks, workbooks and session exercises, which usually get less effort.", min: 0, max: 10, step: 0.5 },
  ] },
  { title: "Quantitative and qualitative evidence", intro: "How the Holistic view blends the numbers with the AI's reading of your work, feedback and projects.", fields: [
    { path: "quantShare", label: "Share for marks and tests (quantitative)", help: "The rest goes to the AI's qualitative reading. 0.6 means 60% numbers, 40% qualitative.", min: 0, max: 1, step: 0.05 },
    { path: "aiGradeFactor", label: "Weight of an AI grade next to an official mark", help: "Used only where no official mark exists. 1 counts it fully; 0 ignores AI grades.", min: 0, max: 1, step: 0.05 },
    { path: "reasoningShare", label: "Reasoning tests in analytical reasoning", help: "Extra weight of your reasoning-test results in that one skill.", min: 0, max: 1, step: 0.05 },
  ] },
  { title: "Benchmarks", intro: "The dashboard's own conventions — change them to match what your target roles expect.", fields: [
    { path: "roleThresholds.core", label: "Course that is core to a role", help: "Mark a core course should reach for that role.", min: 0, max: 100, step: 1 },
    { path: "roleThresholds.supporting", label: "Supporting course", help: "Mark a supporting course should reach.", min: 0, max: 100, step: 1 },
    { path: "roleThresholds.peripheral", label: "Peripheral course", help: "Mark a peripheral course should reach.", min: 0, max: 100, step: 1 },
    { path: "bands.high", label: "A high result (competencies)", help: "At or above this, a result counts towards a strength.", min: 1, max: 100, step: 1 },
    { path: "bands.low", label: "A low result (competencies)", help: "Below this, a result counts towards a development area.", min: 0, max: 99, step: 1 },
  ] },
];

const get = (rubric: Rubric, path: string) => path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], rubric) as number;
const set = (rubric: Rubric, path: string, value: number): Rubric => { const copy = structuredClone(rubric) as unknown as Record<string, unknown>; const keys = path.split("."); let node = copy; for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>; node[keys.at(-1)!] = value; return copy as unknown as Rubric; };

export function RubricForm({ initial, defaults }: { initial: Rubric; defaults: Rubric }) {
  const router = useRouter();
  const [rubric, setRubric] = useState(initial);
  const [message, setMessage] = useState("");
  async function save(reset = false) {
    setMessage("Saving…");
    const response = await fetch("/api/rubric", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(reset ? { reset: true } : { rubric }) });
    const body = await response.json().catch(() => ({})) as { error?: string; rubric?: Rubric };
    if (!response.ok || !body.rubric) { setMessage(body.error ?? "Could not save."); return; }
    setRubric(body.rubric); setMessage(reset ? "Reset to the defaults. Figures across the dashboard use them now." : "Saved. Figures across the dashboard use the new weights now.");
    router.refresh();
  }
  return <div className="rubric-form">
    {GROUPS.map((group) => <section key={group.title} className="content-panel rubric-group"><h2>{group.title}</h2><p className="empty-hint">{group.intro}</p>
      {group.fields.map((field) => <label key={field.path} className="rubric-field"><span><strong>{field.label}</strong><small>{field.help} Default {get(defaults, field.path)}.</small></span>
        <input type="number" min={field.min} max={field.max} step={field.step} value={get(rubric, field.path)} onChange={(event) => setRubric(set(rubric, field.path, Number(event.target.value)))} /></label>)}
    </section>)}
    <div className="inline-action"><button type="button" className="button button-primary" onClick={() => void save()}>Save weights</button><button type="button" className="button button-secondary" onClick={() => void save(true)}>Reset to defaults</button>{message && <small role="status">{message}</small>}</div>
  </div>;
}
