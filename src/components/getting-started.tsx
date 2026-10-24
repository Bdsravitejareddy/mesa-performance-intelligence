import Link from "next/link";
import { Check } from "lucide-react";
import type { Step } from "@/lib/profile/onboarding";

// First-run checklist: what is connected, what each step fills in, and what grey means in the meantime.
export function GettingStarted({ steps }: { steps: Step[] }) {
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  return <section className="getting-started" aria-label="Getting started">
    <div className="panel-head"><div><span className="eyebrow"><span className="eyebrow-line" /> Getting started</span><h2>{done} of {steps.length} steps done</h2></div><span className="start-bar" aria-hidden="true"><i style={{ width: `${(done / steps.length) * 100}%` }} /></span></div>
    <p className="empty-hint">Grey on any page means <b>no evidence yet — not a weakness</b>. Each step below fills part of the picture; most of the map stays grey until your faculty release marks, and until then figures rest on AI grades and say so.</p>
    <ol className="start-steps">{steps.map((step) => <li key={step.key} className={step.done ? "is-done" : undefined}>
      <span className="start-check" aria-hidden="true">{step.done ? <Check size={14} /> : null}</span>
      <span><Link href={step.href} className="start-title">{step.title}</Link><small>{step.fills}</small></span>
      <em>{step.done ? "Done" : "To do"}</em>
    </li>)}</ol>
  </section>;
}
