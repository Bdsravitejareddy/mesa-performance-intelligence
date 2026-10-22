"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, Search, Zap } from "lucide-react";

export type PaletteLink = { href: string; label: string; group: string };
type Action = { id: string; label: string; hint: string; run: () => Promise<string> };

async function post(path: string, done: (body: Record<string, unknown>) => string) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error ?? "That action failed."));
  return done(body);
}

// ⌘K / Ctrl+K: jump to any page or run a workspace action, with arrow-key navigation.
export function CommandPalette({ links, open, onClose }: { links: PaletteLink[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const actions: Action[] = useMemo(() => [
    { id: "sync", label: "Sync Mesa LMS now", hint: "Imports new marks and feedback", run: () => post("/api/lms-sync", (body) => String(body.message ?? "Sync finished.")) },
    { id: "map", label: "Map assessments to competencies", hint: "Gemini maps untagged assessments", run: () => post("/api/assessment-competencies/auto", (body) => `Mapped ${body.assessments ?? 0} assessments.`) },
    { id: "describe", label: "Describe flagged slides", hint: "Gemini reads images and charts", run: () => post("/api/materials/describe", (body) => `Processed ${(body.outcomes as unknown[] | undefined)?.length ?? 0} documents.`) },
    { id: "submissions", label: "Find my submissions in Drive", hint: "Matches files to assessments", run: () => post("/api/materials/submissions", (body) => `Checked ${(body.outcomes as unknown[] | undefined)?.length ?? 0} files.`) },
  ], []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = links.filter((link) => !q || `${link.label} ${link.group}`.toLowerCase().includes(q)).map((link) => ({ kind: "page" as const, key: link.href, label: link.label, hint: link.group, link }));
    const runs = actions.filter((action) => !q || `${action.label} ${action.hint}`.toLowerCase().includes(q)).map((action) => ({ kind: "action" as const, key: action.id, label: action.label, hint: action.hint, action }));
    return [...pages, ...runs];
  }, [query, links, actions]);

  useEffect(() => { if (open) { setQuery(""); setActive(0); setStatus(""); window.setTimeout(() => input.current?.focus(), 20); } }, [open]);
  useEffect(() => { setActive(0); }, [query]);

  async function choose(index: number) {
    const item = results[index];
    if (!item) return;
    if (item.kind === "page") { onClose(); router.push(item.link.href); return; }
    setStatus(`${item.label}…`);
    try { setStatus(await item.action.run()); router.refresh(); } catch (error) { setStatus(error instanceof Error ? error.message : "That action failed."); }
  }

  if (!open) return null;
  return <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={(event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(current + 1, results.length - 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(current - 1, 0)); }
      if (event.key === "Enter") { event.preventDefault(); void choose(active); }
    }}>
      <div className="palette-input"><Search size={17} /><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jump to a page or run an action…" aria-label="Search" /><kbd>esc</kbd></div>
      <ul className="palette-list" role="listbox">{results.map((item, index) => <li key={item.key} role="option" aria-selected={index === active} className={index === active ? "active" : ""} onMouseEnter={() => setActive(index)} onClick={() => void choose(index)}>
        {item.kind === "action" ? <Zap size={15} /> : <ArrowRight size={15} />}<span><strong>{item.label}</strong><small>{item.hint}</small></span>{index === active && <CornerDownLeft size={13} className="palette-enter" />}
      </li>)}{!results.length && <li className="palette-empty">Nothing matches “{query}”.</li>}</ul>
      {status && <p className="palette-status" role="status">{status}</p>}
    </div>
  </div>;
}
