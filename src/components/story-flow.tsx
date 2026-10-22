"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { chapterIndex, chapters, sectionOf, sections } from "@/components/navigation";

const PULL = 200; // scroll distance past either end of a page that opens the neighbouring chapter
const SETTLE_MS = 160; // ignore the tail of scroll momentum that carried the reader to the edge
export const ARRIVE_KEY = "mesa.story.arrive";

// Seamless chapter-to-chapter scrolling. The end of each page is the beginning of the next one: its heading
// sits there, faint, and firms up as you keep scrolling until the next page takes its place. At the top of a
// page, scrolling up returns to the previous chapter, arriving at its end.
export function StorySeams({ pathname }: { pathname: string }) {
  const router = useRouter();
  const index = chapterIndex(pathname);
  const next = index >= 0 ? chapters[index + 1] : undefined;
  const previous = index > 0 ? chapters[index - 1] : undefined;
  const [down, setDown] = useState(0);
  const [up, setUp] = useState(0);
  const leaving = useRef(false);

  // Arriving from the chapter below: start at this page's end, so the story reads continuously upwards.
  useLayoutEffect(() => {
    let arrive: string | null = null;
    try { arrive = window.sessionStorage.getItem(ARRIVE_KEY); window.sessionStorage.removeItem(ARRIVE_KEY); } catch { /* storage may be blocked */ }
    if (arrive === "bottom") window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" as ScrollBehavior });
    document.documentElement.dataset.storyEnter = arrive === "bottom" ? "from-below" : "from-above";
    const timer = window.setTimeout(() => { delete document.documentElement.dataset.storyEnter; }, 700);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (index < 0) return;
    // Full prefetch (data included) of both neighbours, so moving between chapters never waits on the server.
    const full = { kind: "full" } as unknown as Parameters<typeof router.prefetch>[1];
    if (next) router.prefetch(next.href, full);
    if (previous) router.prefetch(previous.href, full);
    const amount = { down: 0, up: 0 };
    const arrived = { down: 0, up: 0 };
    let lastInput = 0;
    let decay = 0;
    let touchY: number | null = null;
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 6;
    const atTop = () => window.scrollY <= 2;
    const publish = () => { setDown(amount.down / PULL); setUp(amount.up / PULL); };
    const go = (direction: "down" | "up") => {
      const target = direction === "down" ? next : previous;
      if (!target || leaving.current) return;
      leaving.current = true;
      try { if (direction === "up") window.sessionStorage.setItem(ARRIVE_KEY, "bottom"); } catch { /* storage may be blocked */ }
      router.push(target.href, { scroll: direction === "down" });
    };
    const relax = () => {
      if (leaving.current) return;
      if (performance.now() - lastInput < 700) { decay = requestAnimationFrame(relax); return; }
      amount.down = amount.down < 1 ? 0 : amount.down * 0.9;
      amount.up = amount.up < 1 ? 0 : amount.up * 0.9;
      publish();
      if (amount.down || amount.up) decay = requestAnimationFrame(relax);
    };
    const push = (delta: number) => {
      if (leaving.current || !delta) return;
      const direction = delta > 0 ? "down" : "up";
      const edge = direction === "down" ? atBottom() && next : atTop() && previous;
      const now = performance.now();
      if (!edge) { arrived[direction] = 0; if (amount[direction]) { amount[direction] = 0; publish(); } return; }
      if (!arrived[direction]) arrived[direction] = now;
      if (now - arrived[direction] < SETTLE_MS) return;
      lastInput = now;
      amount[direction] = Math.min(PULL, amount[direction] + Math.abs(delta));
      amount[direction === "down" ? "up" : "down"] = 0;
      publish();
      cancelAnimationFrame(decay);
      decay = requestAnimationFrame(relax);
      if (amount[direction] >= PULL) go(direction);
    };
    const onWheel = (event: WheelEvent) => push(event.deltaMode === 1 ? event.deltaY * 32 : event.deltaY);
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? null; };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      push((touchY - y) * 1.6);
      touchY = y;
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true], dialog")) return;
      if (["ArrowDown", "PageDown", " "].includes(event.key)) push(event.key === "ArrowDown" ? 90 : 200);
      if (["ArrowUp", "PageUp"].includes(event.key)) push(event.key === "ArrowUp" ? -90 : -200);
    };
    const onScroll = () => {
      if (!atBottom()) { arrived.down = 0; if (amount.down) { amount.down = 0; publish(); } }
      if (!atTop()) { arrived.up = 0; if (amount.up) { amount.up = 0; publish(); } }
    };
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
      delete document.documentElement.dataset.storyLeave;
    };
  }, [index, next, previous, router]);

  if (index < 0) return null;
  return <>
    {previous && <div className="seam-up" aria-hidden={up < 0.05} style={{ ["--pull" as string]: String(up) }}>
      <span className="seam-up-pill">↑ {previous.label}<i /></span>
    </div>}
    {next ? <Link href={next.href} className="seam-next" style={{ ["--pull" as string]: String(down) }} aria-label={`Continue to ${next.label}`}>
      <span className="eyebrow"><span className="eyebrow-line" /> {String(index + 2).padStart(2, "0")} · {next.act}</span>
      <span className="seam-title">{next.label}</span>
      <span className="seam-blurb">{next.blurb}</span>
      <span className="seam-meter"><i /></span>
    </Link> : <div className="seam-end"><span className="eyebrow"><span className="eyebrow-line" /> The end, for now</span><Link href="/" className="seam-title">Back to the beginning</Link></div>}
  </>;
}

// Right-hand rail: where this page sits in the story, plus reading progress within it.
export function ChapterRail({ pathname }: { pathname: string }) {
  const current = sectionOf(pathname);
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
      {sections.map((chapter, index) => <Link key={chapter.href} href={chapter.href} className={`rail-dot tone-${chapter.tone}${index === current ? " is-current" : ""}${index < current ? " is-read" : ""}`} aria-current={index === current ? "page" : undefined}>
        <span className="rail-label"><small>{String(index + 1).padStart(2, "0")}</small>{chapter.label}</span>
      </Link>)}
    </nav>
  </>;
}
