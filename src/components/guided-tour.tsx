"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Mouse, X } from "lucide-react";
import { groups } from "@/components/navigation";

export const TOUR_KEY = "mesa.tour.v1";

type Step = { target?: string; kicker: string; title: string; body: string; visual?: "scroll" };
const STEPS: Step[] = [
  { kicker: "Welcome", title: "Your performance, told as one story.", body: "" },
  { target: "nav", kicker: "01 · Chapters", title: "Every page is a chapter.", body: "They run in order, in three acts: your material first, then what it means, then tools to sharpen your work. Click any chapter to jump straight to it." },
  { kicker: "02 · Keep scrolling", title: "One continuous scroll.", body: "The next chapter's title is waiting at the end of every page — keep scrolling and it takes over. At the top of a page, keep scrolling up to return to the previous chapter. A short pause at each edge stops it happening by accident.", visual: "scroll" },
  { target: "rail", kicker: "03 · Where you are", title: "The rail shows your place.", body: "Each dot is a chapter. Filled dots are behind you, the bright one is where you are, and the thin line at the top shows how far down this page you have read." },
  { target: "search", kicker: "04 · Shortcut", title: "Press ⌘K to go anywhere.", body: "Jump to any chapter or run an action — sync the LMS, map assessments, describe slides — without leaving the keyboard." },
  { target: "sync", kicker: "05 · Your data", title: "Synced every night.", body: "Marks and feedback come from the Mesa LMS and your Drive course folders at 03:00 UTC. If a sync has a problem, it shows up here and on the overview." },
  { target: "tour", kicker: "06 · Any time", title: "Replay this tour here.", body: "That is everything. Start with the overview, or simply begin scrolling." },
];

type Box = { top: number; left: number; width: number; height: number };

export function GuidedTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const current = STEPS[step];

  const finish = useCallback(() => {
    try { window.localStorage.setItem(TOUR_KEY, new Date().toISOString()); } catch { /* storage may be blocked */ }
    setStep(0);
    onClose();
  }, [onClose]);

  // Find the step's target; a target that is hidden at this screen size falls back to a centred card.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const element = current.target ? document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`) : null;
      const rect = element?.getBoundingClientRect();
      setBox(rect && rect.width > 4 && rect.height > 4 ? { top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure); };
  }, [open, current.target]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") { if (step < STEPS.length - 1) setStep(step + 1); else finish(); }
      if (event.key === "ArrowLeft") setStep(Math.max(0, step - 1));
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.classList.add("tour-open");
    return () => { window.removeEventListener("keydown", onKey); document.documentElement.classList.remove("tour-open"); };
  }, [open, finish, step]);

  if (!open) return null;
  const last = step === STEPS.length - 1;
  const next = () => (last ? finish() : setStep(step + 1));

  if (step === 0) {
    return <div className="tour-cover" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-cover-inner">
        <span className="tour-kicker">A short guided tour · 1 minute</span>
        <h1 id="tour-title" className="tour-cover-title">Your performance,<br /><em>told as one story.</em></h1>
        <p className="tour-cover-lede">Mesa reads your courses, marks and feedback, then explains what they show, one chapter at a time. Here is how to find your way around.</p>
        <ol className="tour-acts">
          {groups.map((group, index) => <li key={group.label} className={`tour-act tone-${group.tone}`} style={{ animationDelay: `${0.25 + index * 0.12}s` }}>
            <span className="tour-act-number">{group.act.split(" · ")[0]}</span>
            <strong>{group.act.split(" · ")[1]}</strong>
            <small>{group.links.map((link) => link.label).join(" · ")}</small>
          </li>)}
        </ol>
        <div className="tour-cover-actions">
          <button type="button" className="tour-primary" onClick={() => setStep(1)} autoFocus>Start the tour <ArrowRight size={16} /></button>
          <button type="button" className="tour-ghost" onClick={finish}>Skip — I'll explore</button>
        </div>
      </div>
    </div>;
  }

  const width = typeof window === "undefined" ? 340 : Math.min(340, window.innerWidth - 32);
  const placement = (() => {
    if (!box || typeof window === "undefined") return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (box.left + box.width + width + 24 < vw) return { top: Math.max(16, Math.min(box.top, vh - 300)), left: box.left + box.width + 16 };
    if (box.left - width - 24 > 0) return { top: Math.max(16, Math.min(box.top, vh - 300)), left: box.left - width - 16 };
    return { top: Math.min(box.top + box.height + 16, vh - 300), left: Math.max(16, Math.min(box.left, vw - width - 16)) };
  })();

  return <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-step-title">
    <div className={`tour-spotlight${box ? "" : " is-none"}`} style={box ?? undefined} />
    <div className="tour-card" style={{ ...placement, width }}>
      <button type="button" className="tour-close" aria-label="Close the tour" onClick={finish}><X size={15} /></button>
      <span className="tour-kicker">{current.kicker}</span>
      <h2 id="tour-step-title">{current.title}</h2>
      {current.visual === "scroll" && <div className="tour-scroll-visual" aria-hidden="true"><Mouse size={26} strokeWidth={1.5} /><span className="tour-scroll-meter"><i /></span><span>Next chapter</span></div>}
      <p>{current.body}</p>
      <div className="tour-footer">
        <span className="tour-dots">{STEPS.slice(1).map((_, index) => <i key={index} className={index + 1 === step ? "is-on" : ""} />)}</span>
        <span className="tour-buttons">
          <button type="button" className="tour-ghost" onClick={() => setStep(step - 1)} aria-label="Previous step"><ArrowLeft size={15} /></button>
          <button type="button" className="tour-primary" onClick={next} autoFocus>{last ? "Finish" : "Next"} {!last && <ArrowRight size={15} />}</button>
        </span>
      </div>
    </div>
  </div>;
}

export function tourSeen() {
  try { return Boolean(window.localStorage.getItem(TOUR_KEY)); } catch { return true; }
}
