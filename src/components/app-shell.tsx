"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  FileCheck2,
  GraduationCap,
  CloudDownload,
  LayoutDashboard,
  Library,
  MessageSquareText,
  Network,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

const groups = [
  {
    label: "Workspace",
    links: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/courses", label: "Courses & content", icon: BookOpen },
      { href: "/drive-sync", label: "Drive sync", icon: CloudDownload },
      { href: "/materials/review", label: "Material review", icon: ScanSearch },
      { href: "/assessments", label: "Assessments", icon: FileCheck2 },
      { href: "/marks", label: "Marks & feedback", icon: MessageSquareText },
      { href: "/evidence", label: "Evidence library", icon: Library },
    ],
  },
  {
    label: "Insights",
    links: [
      { href: "/competencies", label: "Competency map", icon: Network },
      { href: "/swot", label: "SWOT analysis", icon: Target },
      { href: "/correlations", label: "Correlations", icon: ChartNoAxesCombined },
      { href: "/career", label: "Career readiness", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Tools",
    links: [{ href: "/quality-check", label: "Quality checker", icon: ShieldCheck }],
  },
];

export function AppShell({ children, demoMode }: { children: React.ReactNode; demoMode: boolean }) {
  const pathname = usePathname();

  return (
    <div className="app-frame" data-theme="nature">
      <aside className="sidebar">
        <Link href="/" className="brand-lockup" aria-label="Mesa Performance Intelligence home">
          <span className="brand-mark"><Activity size={18} strokeWidth={2.5} /></span>
          <span className="brand-copy"><strong>mesa</strong><small>PERFORMANCE INTELLIGENCE</small></span>
        </Link>

        <button className="workspace-switcher" type="button">
          <span className="workspace-avatar"><GraduationCap size={17} /></span>
          <span className="workspace-label"><strong>My workspace</strong><small>Academic year 2026</small></span>
          <ChevronDown size={15} className="muted-icon" />
        </button>

        <nav className="main-nav" aria-label="Main navigation">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.links.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link className={`nav-link${active ? " active" : ""}`} href={href} key={href} aria-current={active ? "page" : undefined}>
                    <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sync-status"><span className="status-dot" /><span><strong>LMS sync</strong><small>{demoMode ? "Preview only" : "Sync in Marks & feedback"}</small></span><Link href="/marks" title="Open marks and run an LMS sync" aria-label="Open marks and run an LMS sync"><ArrowUpRight size={14} /></Link></div>
          <Link href="/setup" className="nav-link"><CircleHelp size={17} /><span>Setup & help</span></Link>
          <div className="profile-card">
            <div className="profile-avatar">MP</div>
            <span><strong>Student profile</strong><small>{demoMode ? "Preview workspace" : "Private account"}</small></span>
            <ChevronDown size={15} className="muted-icon" />
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>Performance intelligence</span><span className="crumb-divider">/</span><strong>{pageTitle(pathname)}</strong></div>
          <div className="topbar-actions">
            <button className="search-trigger" type="button" aria-label="Search"><Search size={16} /><span>Search anything</span><kbd>⌘ K</kbd></button>
            <button className="icon-button" title="AI insights" type="button"><Sparkles size={17} /></button>
            <div className="topbar-date"><span className="date-dot" /> October 2026</div>
          </div>
        </header>
        {demoMode && <div className="demo-banner"><span className="demo-banner-icon"><Sparkles size={14} /></span><strong>Illustrative preview</strong><span>Sample figures are synthetic and are not actual Mesa student records.</span><Link href="/setup">Connect your workspace <ArrowUpRight size={13} /></Link></div>}
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname === "/") return "Overview";
  return pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? "Overview";
}
