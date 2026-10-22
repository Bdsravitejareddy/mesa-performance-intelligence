import {
  BookOpen,
  BriefcaseBusiness,
  Brain,
  FileCheck2,
  LayoutDashboard,
  Network,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type Tab = { href: string; label: string; blurb: string };
// A section is one entry in the sidebar; its tabs are the pages inside it. The first tab is its home.
export type Section = { href: string; label: string; icon: LucideIcon; blurb: string; tabs: Tab[] };
export type Act = { label: string; act: string; tone: "gold" | "moss" | "dusk"; links: Section[] };

const section = (label: string, icon: LucideIcon, blurb: string, tabs: Tab[]): Section => ({ href: tabs[0].href, label, icon, blurb, tabs });

// The site reads as one story in three acts. Seven sections replace the former seventeen pages; related
// pages sit as tabs inside a section.
export const groups: Act[] = [
  {
    label: "Workspace",
    act: "Act I · Your material",
    tone: "gold",
    links: [
      section("Overview", LayoutDashboard, "The whole picture in one view.", [{ href: "/", label: "Overview", blurb: "The whole picture in one view." }]),
      section("Courses", BookOpen, "What you were taught, and where it comes from.", [
        { href: "/courses", label: "Courses", blurb: "What you were taught, course by course." },
        { href: "/materials/review", label: "Material review", blurb: "Slides and answer keys, read by vision AI." },
        { href: "/drive-sync", label: "Drive sync", blurb: "Your course folders and submitted work, kept in step." },
      ]),
      section("Assessments", FileCheck2, "Every assessment, its marks and how your work was graded.", [
        { href: "/assessments", label: "All assessments", blurb: "Every assessment with its status, marks and grades." },
        { href: "/grading", label: "Graded work", blurb: "Each submission graded by code and AI, beside the official mark." },
        { href: "/marks", label: "Marks & LMS sync", blurb: "Official marks and faculty feedback from the LMS." },
        { href: "/evidence", label: "Evidence", blurb: "Every record the analysis uses, with its source." },
      ]),
    ],
  },
  {
    label: "Insights",
    act: "Act II · What it means",
    tone: "moss",
    links: [
      section("Insights", Network, "Competencies, strengths and patterns from your evidence.", [
        { href: "/competencies", label: "Competencies", blurb: "Thirty-five competencies, classified from evidence." },
        { href: "/swot", label: "SWOT", blurb: "Strengths, weaknesses, opportunities and threats, from evidence." },
        { href: "/correlations", label: "Patterns", blurb: "What moves together in your results — never causes." },
      ]),
      section("You", Brain, "How you think and work, in context.", [
        { href: "/thinking", label: "Thinking & behaviour", blurb: "How you approach problems, as observed patterns." },
        { href: "/tests", label: "Reasoning & personality", blurb: "Self-tests that add context, never verdicts." },
      ]),
      section("Career", BriefcaseBusiness, "Your evidence against target roles, and what to do next.", [
        { href: "/career", label: "Readiness", blurb: "Your evidence against real job postings." },
        { href: "/roadmap", label: "Roadmap", blurb: "What to do next, ranked by what matters." },
        { href: "/professional", label: "Resume & portfolio", blurb: "Every claim, and how it is supported." },
      ]),
    ],
  },
  {
    label: "Tools",
    act: "Act III · Sharpen",
    tone: "dusk",
    links: [section("Quality checker", ShieldCheck, "A blind evaluation of your work before you submit.", [{ href: "/quality-check", label: "Quality checker", blurb: "A blind evaluation of your work before you submit." }])],
  },
];

export const sections = groups.flatMap((group) => group.links.map((link) => ({ ...link, act: group.act, tone: group.tone })));

// Scrolling moves through every tab in order, then into the next section.
export const chapters = sections.flatMap((item) => item.tabs.map((tab) => ({ ...tab, icon: item.icon, section: item.label, act: item.act, tone: item.tone })));

const matches = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

export function chapterIndex(pathname: string) {
  return chapters.findIndex((chapter) => (chapter.href === "/" ? pathname === "/" : pathname === chapter.href));
}

// The section a page belongs to, including detail pages such as /courses/<id> or /materials/<id>.
export function sectionOf(pathname: string) {
  return sections.findIndex((item) => item.tabs.some((tab) => matches(tab.href, pathname) || (tab.href.split("/").length > 2 && matches(`/${tab.href.split("/")[1]}`, pathname))));
}

export function sectionIndex(pathname: string) {
  const found = sectionOf(pathname);
  return found >= 0 ? chapters.findIndex((chapter) => chapter.href === sections[found].href) : -1;
}
