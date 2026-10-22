"use client";

import { useEffect } from "react";

// A fixed landscape behind every page, so the glass surfaces have light and colour to refract.
// Its palette follows the act (gold → moss → dusk) and its ridges drift slightly as you scroll.
export function GlassBackdrop() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        document.documentElement.style.setProperty("--scroll", (window.scrollY / max).toFixed(4));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); };
  }, []);

  return <div className="glass-scene" aria-hidden="true">
    <div className="scene-sky" />
    <div className="scene-sun" />
    <div className="scene-orb scene-orb-a" />
    <div className="scene-orb scene-orb-b" />
    <div className="scene-orb scene-orb-c" />
    <svg className="scene-ridge scene-ridge-far" viewBox="0 0 1440 320" preserveAspectRatio="none"><path d="M0 220 L120 170 L230 200 L360 120 L470 165 L600 95 L720 150 L850 80 L980 140 L1100 105 L1230 160 L1340 120 L1440 150 L1440 320 L0 320Z" /></svg>
    <svg className="scene-ridge scene-ridge-mid" viewBox="0 0 1440 320" preserveAspectRatio="none"><path d="M0 250 L140 200 L260 235 L400 170 L540 220 L680 160 L800 215 L940 175 L1080 230 L1220 185 L1340 220 L1440 200 L1440 320 L0 320Z" /></svg>
    <svg className="scene-ridge scene-ridge-near" viewBox="0 0 1440 320" preserveAspectRatio="none"><path d="M0 290 C180 250 320 270 480 255 C640 240 760 285 920 270 C1080 255 1240 280 1440 262 L1440 320 L0 320Z" /></svg>
    <div className="scene-grain" />
  </div>;
}
