"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Counts a leading number up from zero when it first scrolls into view; the final text is rendered on the server.
export function CountUp({ value, durationMs = 1100 }: { value: string; durationMs?: number }) {
  const match = value.match(/^(\d+(?:\.\d+)?)(.*)$/);
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!match || !node || prefersReducedMotion()) return;
    const target = Number(match[1]);
    const decimals = match[1].includes(".") ? match[1].split(".")[1].length : 0;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(`${(target * eased).toFixed(decimals)}${match[2]}`);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value, durationMs]);
  return <span ref={ref}>{display}</span>;
}

// Moves layered hero scenery with the pointer. Layers read --px/--py (−1…1) and multiply by their own depth.
export function ParallaxHero({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return;
    let frame = 0;
    let targetX = 0, targetY = 0, x = 0, y = 0;
    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    const onLeave = () => { targetX = 0; targetY = 0; };
    const tick = () => {
      x += (targetX - x) * 0.06;
      y += (targetY - y) * 0.06;
      node.style.setProperty("--px", x.toFixed(4));
      node.style.setProperty("--py", y.toFixed(4));
      frame = requestAnimationFrame(tick);
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); node.removeEventListener("pointermove", onMove); node.removeEventListener("pointerleave", onLeave); };
  }, []);
  return <section ref={ref} className={className}>
    <div className="hero-scene" aria-hidden="true">
      <span className="hero-layer hero-sky" />
      <span className="hero-layer hero-sun" />
      <span className="hero-layer hero-ridge hero-ridge-far" />
      <span className="hero-layer hero-mist hero-mist-1" />
      <span className="hero-layer hero-ridge hero-ridge-mid" />
      <span className="hero-layer hero-mist hero-mist-2" />
      <span className="hero-layer hero-ridge hero-ridge-near" />
    </div>
    {children}
  </section>;
}

// Fades panels up as they enter the viewport. Elements already on screen at load animate immediately.
export const REVEAL_SELECTOR = ".metric-card,.panel,.content-panel,.competency-summary-item,.swot-card,.course-card,.review-row,.link-row,.competency-row,.mark-feedback-row,.evidence-table-row";

export function useRevealOnScroll(dependency: unknown) {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const nodes = [...document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)].filter((node) => !node.classList.contains("is-revealed"));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -6% 0px" });
    nodes.forEach((node, index) => {
      node.classList.add("reveal");
      node.style.setProperty("--reveal-delay", `${Math.min(index % 8, 7) * 55}ms`);
      observer.observe(node);
    });
    // Never leave content hidden if an element is not reported as intersecting (e.g. inside a closed section).
    const failSafe = window.setTimeout(() => nodes.forEach((node) => node.classList.add("is-revealed")), 4000);
    return () => { observer.disconnect(); window.clearTimeout(failSafe); };
  }, [dependency]);
}

// Cycles through words with a vertical slide; the first word is rendered on the server.
export function RotatingWord({ words, intervalMs = 2600 }: { words: string[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion() || words.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % words.length), intervalMs);
    return () => window.clearInterval(timer);
  }, [words.length, intervalMs]);
  return <span className="rotating-word" aria-live="polite"><span key={index} className="rotating-word-inner">{words[index]}</span></span>;
}

// Cards light up under the cursor: sets --mx/--my on the hovered card for a radial highlight.
export function useSpotlight() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>(".metric-card,.panel,.content-panel,.swot-item,.role-card,.roadmap-item,.quality-dimension,.competency-summary-item");
      if (!card) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        card.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(frame); };
  }, []);
}
