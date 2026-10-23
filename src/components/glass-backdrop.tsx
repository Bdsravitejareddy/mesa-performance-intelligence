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
    {/* Soft clouds drift across at different heights and speeds. */}
    <div className="scene-clouds" aria-hidden="true">{[
      { top: "9vh", scale: 1, duration: 140, delay: -20 }, { top: "18vh", scale: 0.7, duration: 190, delay: -90 },
      { top: "5vh", scale: 0.55, duration: 230, delay: -160 }, { top: "26vh", scale: 0.85, duration: 170, delay: -50 },
    ].map((cloud, index) => <svg key={index} className="scene-cloud" viewBox="0 0 220 80" style={{ top: cloud.top, width: `${cloud.scale * 260}px`, animationDuration: `${cloud.duration}s`, animationDelay: `${cloud.delay}s` }}><path d="M30 64 C8 64 4 40 26 36 C26 18 50 10 66 22 C76 4 110 2 122 24 C136 12 166 16 168 38 C192 36 206 60 184 64 Z" /></svg>)}</div>
    <svg className="scene-ridge scene-ridge-near" viewBox="0 0 1440 320" preserveAspectRatio="none"><path d="M0 290 C180 250 320 270 480 255 C640 240 760 285 920 270 C1080 255 1240 280 1440 262 L1440 320 L0 320Z" /></svg>
    {/* A line of trees on the near ridge, each swaying gently on its own rhythm. */}
    <svg className="scene-trees" viewBox="0 0 1440 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">{[60, 150, 210, 420, 470, 700, 980, 1040, 1110, 1300, 1370].map((x, index) => {
      const height = 46 + ((index * 37) % 34);
      return <g key={x} className="scene-tree" style={{ transformOrigin: `${x}px 120px`, animationDuration: `${6 + (index % 4) * 1.3}s`, animationDelay: `${-index * 0.9}s` }}>
        <rect x={x - 1.5} y={120 - 10} width="3" height="10" />
        <path d={`M${x} ${120 - height} L${x + height * 0.22} ${120 - height * 0.45} L${x + height * 0.12} ${120 - height * 0.45} L${x + height * 0.3} ${120 - 8} L${x - height * 0.3} ${120 - 8} L${x - height * 0.12} ${120 - height * 0.45} L${x - height * 0.22} ${120 - height * 0.45} Z`} />
      </g>;
    })}</svg>

    <div className="scene-grain" />
  </div>;
}
