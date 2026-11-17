import type { TermChoice } from "@/lib/term";

// Shown on pages that read every term on purpose (skills, readiness and patterns build across terms), so a reader
// who picked a term in the header is not misled into thinking the page is filtered.
export function TermScopeNote({ term, reason }: { term: TermChoice; reason: string }) {
  if (term === "all") return null;
  return <p className="term-scope-note" role="note">Showing all terms, not just {term}: {reason}</p>;
}
