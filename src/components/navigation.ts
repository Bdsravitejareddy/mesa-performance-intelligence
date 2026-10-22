import {
  BookOpen,
  Brain,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ClipboardCheck,
  CloudDownload,
  FileCheck2,
  FileUser,
  LayoutDashboard,
  Library,
  MessageSquareText,
  Network,
  Route,
  ScanSearch,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";

export type Chapter = { href: string; label: string; icon: LucideIcon; blurb: string };
export type Act = { label: string; act: string; tone: "gold" | "moss" | "dusk"; links: Chapter[] };

// The site reads as one story: each page is a chapter, in this order, grouped into three acts.
export const groups: Act[] = [
  {
    label: "Workspace",
    act: "Act I · Your material",
    tone: "gold",
    links: [
      { href: "/", label: "Overview", icon: LayoutDashboard, blurb: "The whole picture in one view." },
      { href: "/courses", label: "Courses & content", icon: BookOpen, blurb: "What you were taught, course by course." },
      { href: "/drive-sync", label: "Drive sync", icon: CloudDownload, blurb: "Your course folders, kept in step automatically." },
      { href: "/materials/review", label: "Material review", icon: ScanSearch, blurb: "Slides and answer keys, read by vision AI." },
      { href: "/assessments", label: "Assessments", icon: FileCheck2, blurb: "Every task, with its brief and rubric." },
      { href: "/marks", label: "Marks & feedback", icon: MessageSquareText, blurb: "Official marks and faculty feedback." },
      { href: "/evidence", label: "Evidence library", icon: Library, blurb: "Every piece of evidence, with its source." },
    ],
  },
  {
    label: "Insights",
    act: "Act II · What it means",
    tone: "moss",
    links: [
      { href: "/competencies", label: "Competency map", icon: Network, blurb: "Thirty-five competencies, classified from evidence." },
      { href: "/thinking", label: "Thinking & behaviour", icon: Brain, blurb: "How you approach problems, as observed patterns." },
      { href: "/tests", label: "Reasoning & personality", icon: ClipboardCheck, blurb: "Self-tests that add context, never verdicts." },
      { href: "/swot", label: "SWOT analysis", icon: Target, blurb: "Strengths, weaknesses, opportunities and threats, from evidence." },
      { href: "/roadmap", label: "Growth roadmap", icon: Route, blurb: "What to do next, ranked by what matters." },
      { href: "/correlations", label: "Correlations", icon: ChartNoAxesCombined, blurb: "Patterns across your results — never causes." },
      { href: "/career", label: "Career readiness", icon: BriefcaseBusiness, blurb: "Your evidence against real job postings." },
      { href: "/professional", label: "Resume & portfolio", icon: FileUser, blurb: "Every claim checked against evidence." },
    ],
  },
  {
    label: "Tools",
    act: "Act III · Sharpen",
    tone: "dusk",
    links: [{ href: "/quality-check", label: "Quality checker", icon: ShieldCheck, blurb: "A blind evaluation of your work before you submit." }],
  },
];

export const chapters = groups.flatMap((group) => group.links.map((link) => ({ ...link, act: group.act, tone: group.tone })));

export function chapterIndex(pathname: string) {
  return chapters.findIndex((chapter) => (chapter.href === "/" ? pathname === "/" : pathname === chapter.href));
}

// Detail pages (a course, a material) belong to their parent chapter for scenery and the rail.
export function sectionIndex(pathname: string) {
  const exact = chapterIndex(pathname);
  if (exact >= 0) return exact;
  return chapters.findIndex((chapter) => chapter.href !== "/" && pathname.startsWith(`${chapter.href.split("/").slice(0, 2).join("/")}/`));
}
