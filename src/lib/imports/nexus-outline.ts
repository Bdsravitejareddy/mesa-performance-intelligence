// Course outlines linked from a Nexus course's "Outlines" tab (read with the member's standing read-only approval;
// see AGENTS.md). Nexus links each outline as a Google Sheet; its read-only HTML view is parsed into plain text,
// one page per sheet tab, so the outline can be cited by document, version and page like any course material.
const NEXUS_COURSE = /^https:\/\/students\.mesaschool\.co\.in\/student\/lms\/courses\/([0-9a-f-]{36})\/?$/;
const SHEET = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})(?:\/|$)/;

export const MAX_TABS = 10;
export const MAX_PAGE_CHARS = 60_000;

export function nexusCourseId(url: string): string | null {
  return NEXUS_COURSE.exec(url.trim())?.[1] ?? null;
}

export function outlineSheetId(url: string): string | null {
  return SHEET.exec(url.trim())?.[1] ?? null;
}

export const sheetViewUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/htmlview`;
export const sheetTabUrl = (id: string, gid: string) => `https://docs.google.com/spreadsheets/d/${id}/htmlview/sheet?headers=false&gid=${gid}`;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, name: string) => {
    if (name[0] === "#") { const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1)); return Number.isFinite(code) ? String.fromCodePoint(code) : match; }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

// The tabs the view lists: items.push({name: "…", pageUrl: "…gid=123…"}).
export function sheetTabs(html: string): { name: string; gid: string }[] {
  const tabs: { name: string; gid: string }[] = [];
  for (const match of html.matchAll(/items\.push\(\{name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*?gid=(\d+)/g)) {
    const name = decode(match[1].replace(/\\x([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))).replace(/\\(.)/g, "$1")).trim();
    if (!tabs.some((tab) => tab.gid === match[2])) tabs.push({ name: name || `Sheet ${tabs.length + 1}`, gid: match[2] });
  }
  return tabs.slice(0, MAX_TABS);
}

// Rows of the rendered sheet as text: non-empty cells joined with " | ", line breaks inside a cell kept.
export function sheetText(html: string): string {
  const lines: string[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map((cell) => decode(cell[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim())
      .filter(Boolean);
    if (cells.length) lines.push(cells.join(" | "));
  }
  return lines.join("\n").slice(0, MAX_PAGE_CHARS);
}

export type OutlinePage = { pageNumber: number; tab: string; text: string };

// The stored file: a provenance header, then each tab as its own numbered page.
export function outlineDocument(meta: { course: string; nexusUrl: string; sheetUrl: string; readOn: string }, pages: OutlinePage[]): string {
  return [`Course outline — ${meta.course}`, `Source: Nexus course page ${meta.nexusUrl} (Outlines tab), linked Google Sheet ${meta.sheetUrl}`, `Read on ${meta.readOn} through the member's own signed-in browser (read-only).`, "",
    ...pages.flatMap((page) => [`=== Page ${page.pageNumber}: ${page.tab} ===`, page.text, ""])].join("\n");
}
