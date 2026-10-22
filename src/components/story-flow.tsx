"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft } from "lucide-react";
import { chapterIndex, chapters, sectionIndex } from "@/components/navigation";

const PULL = 520; // scroll distance past the end of a page that opens the next chapter
const SETTLE_MS = 450; // ignore scroll momentum that carried the reader to the bottom

// The closing band of every chapter: keep scrolling past it, or click it, to continue the story.
export function NextChapter({ pathname }: { pathname: string }) {
  const router = useRouter();
  const index = chapterIndex(pathname);
  const next = index >= 0 ? chapters[index + 1] : undefined;
  const previous = index > 0 ? chapters[index - 1] : undefined;
  const [pull, setPull] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!next) return;
    router.prefetch(next.href);
    let amount = 0;
    let arrivedAt = 0;
    let decay = 0;
    let lastInput = 0;
    let touchY: number | null = null;
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 6;
    const set = (value: number) => { amount = value; setPull(value / PULL); };
    const go = () => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      setLeaving(true);
      document.documentElement.classList.add("story-leaving");
      window.setTimeout(() => { router.push(next.href); }, 380);
    };
    const relax = () => {
      if (performance.now() - lastInput < 260 || leavingRef.current) { decay = requestAnimationFrame(relax); return; }
      if (amount <= 1) { set(0); return; }
      set(amount * 0.86);
      decay = requestAnimationFrame(relax);
    };
    const add = (delta: number) => {
      if (leavingRef.current) return;
      if (!atBottom()) { arrivedAt = 0; if (amount) set(0); return; }
      const now = performance.now();
      if (!arrivedAt) arrivedAt = now;
      if (now - arrivedAt < SETTLE_MS || delta <= 0) return;
      lastInput = now;
      set(Math.min(PULL, amount + delta));
      cancelAnimationFrame(decay);
      decay = requestAnimationFrame(relax);
      if (amount >= PULL) go();
    };
    const onWheel = (event: WheelEvent) => add(event.deltaMode === 1 ? event.deltaY * 32 : event.deltaY);
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? null; };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      add((touchY - y) * 1.6);
      touchY = y;
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (["ArrowDown", "PageDown", " "].includes(event.key)) add(event.key === "ArrowDown" ? 120 : 260);
    };
    const onScroll = () => { if (!atBottom()) { arrivedAt = 0; if (amount) set(0); } };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(decay);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [next, router]);

  useEffect(() => () => document.documentElement.classList.remove("story-leaving"), [pathname]);

  if (index < 0) return null;
  if (!next) {
    return <section className="next-chapter next-chapter-end" aria-label="End of the story">
      <span className="next-chapter-kicker">The end — for now</span>
      <h2 className="next-chapter-title">You have reached the last chapter.</h2>
      <p className="next-chapter-blurb">Begin again from the overview, or jump anywhere with ⌘K.</p>
      <div className="next-chapter-links"><Link href="/" className="button button-light">Back to the overview</Link>{previous && <Link href={previous.href} className="next-chapter-back"><ArrowLeft size={14} /> {previous.label}</Link>}</div>
    </section>;
  }
  const Icon = next.icon;
  return <section className={`next-chapter tone-${next.tone}${leaving ? " is-leaving" : ""}`} aria-label={`Next chapter: ${next.label}`} style={{ ["--pull" as string]: String(pull) }}>
    <span className="next-chapter-kicker">Chapter {String(index + 2).padStart(2, "0")} of {chapters.length} · {next.act}</span>
    <Link href={next.href} className="next-chapter-link" onClick={() => document.documentElement.classList.add("story-leaving")}>
      <span className="next-chapter-icon"><Icon size={22} strokeWidth={1.6} /></span>
      <h2 className="next-chapter-title">{next.label}</h2>
    </Link>
    <p className="next-chapter-blurb">{next.blurb}</p>
    <div className="next-chapter-meter" aria-hidden="true"><i /></div>
    <span className="next-chapter-hint"><ArrowDown size={14} /> {pull > 0.05 ? "Keep going…" : "Keep scrolling to continue"}</span>
    {previous && <Link href={previous.href} className="next-chapter-back"><ArrowLeft size={14} /> Back to {previous.label}</Link>}
  </section>;
}

// Right-hand rail: where this page sits in the story, plus reading progress within it.
export function ChapterRail({ pathname }: { pathname: string }) {
  const current = sectionIndex(pathname);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [pathname]);
  return <>
    <div className="read-progress" aria-hidden="true" style={{ transform: `scaleX(${progress})` }} />
    <nav className="chapter-rail" aria-label="Story chapters" data-tour="rail">
      {chapters.map((chapter, index) => <Link key={chapter.href} href={chapter.href} className={`rail-dot tone-${chapter.tone}${index === current ? " is-current" : ""}${index < current ? " is-read" : ""}`} aria-current={index === current ? "page" : undefined}>
        <span className="rail-label"><small>{String(index + 1).padStart(2, "0")}</small>{chapter.label}</span>
      </Link>)}
    </nav>
  </>;
}
