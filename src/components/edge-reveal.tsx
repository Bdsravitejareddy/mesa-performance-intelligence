"use client";

import { useEffect } from "react";

const EDGE = 18; // px from the screen edge that reveals a panel
const CLOSE_DELAY = 380;

// Sidebar and chapter rail stay out of the way until the cursor touches the left or right edge, and slide
// back out shortly after it leaves them. Only on devices with a precise hovering pointer; touch keeps them.
export function useEdgeReveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    root.dataset.edgeReveal = "on";
    const timers: Record<"nav" | "rail", number> = { nav: 0, rail: 0 };
    const open = (side: "nav" | "rail") => { window.clearTimeout(timers[side]); root.dataset[side === "nav" ? "navOpen" : "railOpen"] = "true"; };
    const close = (side: "nav" | "rail") => {
      window.clearTimeout(timers[side]);
      timers[side] = window.setTimeout(() => { delete root.dataset[side === "nav" ? "navOpen" : "railOpen"]; }, CLOSE_DELAY);
    };
    const onMove = (event: PointerEvent) => {
      const sidebar = document.querySelector(".sidebar")?.getBoundingClientRect();
      const rail = document.querySelector(".chapter-rail")?.getBoundingClientRect();
      if (event.clientX <= EDGE || (root.dataset.navOpen && sidebar && event.clientX <= sidebar.right + 24)) open("nav"); else if (root.dataset.navOpen) close("nav");
      if (event.clientX >= window.innerWidth - EDGE || (root.dataset.railOpen && rail && event.clientX >= rail.left - 24)) open("rail"); else if (root.dataset.railOpen) close("rail");
    };
    const onLeave = () => { close("nav"); close("rail"); };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.clearTimeout(timers.nav); window.clearTimeout(timers.rail);
      delete root.dataset.edgeReveal; delete root.dataset.navOpen; delete root.dataset.railOpen;
    };
  }, []);
}
