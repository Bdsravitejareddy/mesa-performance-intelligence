"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// A compact card that opens its full detail as a whole-page view; Escape or the close button returns. The view is
// rendered on the document body, because a transformed or blurred ancestor would otherwise trap a fixed overlay.
export function ExpandCard({ title, badge, summary, meta, children }: { title: string; badge: ReactNode; summary: string; meta: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.documentElement.style.overflow = ""; };
  }, [open]);
  return <>
    <button type="button" className="content-panel expand-card" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <header><h2>{title}</h2>{badge}</header>
      <p>{summary}</p>
      <small>{meta} · <span className="expand-hint">Open the full reading →</span></small>
    </button>
    {open && createPortal(<div className="expand-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <article className="expand-sheet">
        <header><div><h2>{title}</h2>{badge}</div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button></header>
        <div className="expand-body">{children}</div>
      </article>
    </div>, document.body)}
  </>;
}
