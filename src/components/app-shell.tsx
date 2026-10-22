"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRevealOnScroll, useSpotlight } from "@/components/motion";
import { CommandPalette } from "@/components/command-palette";
import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, ChevronDown, CircleHelp, Compass, GraduationCap, Search, Sparkles } from "lucide-react";
import { groups, sectionIndex, chapters } from "@/components/navigation";
import { NextChapter, ChapterRail } from "@/components/story-flow";
import { GuidedTour, tourSeen } from "@/components/guided-tour";
import { GlassBackdrop } from "@/components/glass-backdrop";


export function AppShell({ children, demoMode }: { children: React.ReactNode; demoMode: boolean }) {
  const pathname = usePathname();
  useRevealOnScroll(pathname);
  useSpotlight();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // First visit on this browser opens the guided tour once; it can be replayed from the top bar.
  useEffect(() => { if (!tourSeen()) { const timer = window.setTimeout(() => setTourOpen(true), 500); return () => window.clearTimeout(timer); } }, []);
  const tone = chapters[sectionIndex(pathname)]?.tone ?? "gold";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen((open) => !open); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-frame glass-ui" data-theme="nature" data-tone={tone}>
      <GlassBackdrop />
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

        <nav className="main-nav" aria-label="Main navigation" data-tour="nav">
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
          <div className="sync-status" data-tour="sync"><span className="status-dot" /><span><strong>LMS sync</strong><small>{demoMode ? "Preview only" : "Sync in Marks & feedback"}</small></span><Link href="/marks" title="Open marks and run an LMS sync" aria-label="Open marks and run an LMS sync"><ArrowUpRight size={14} /></Link></div>
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
            <button className="search-trigger" data-tour="search" type="button" aria-label="Open command palette" onClick={() => setPaletteOpen(true)}><Search size={16} /><span>Search or run…</span><kbd>⌘ K</kbd></button>
            <button className="icon-button tour-trigger" data-tour="tour" title="Guided tour" aria-label="Replay the guided tour" type="button" onClick={() => setTourOpen(true)}><Compass size={17} /></button>
            <div className="topbar-date"><span className="date-dot" /> October 2026</div>
          </div>
        </header>
        {demoMode && <div className="demo-banner"><span className="demo-banner-icon"><Sparkles size={14} /></span><strong>Illustrative preview</strong><span>Sample figures are synthetic and are not actual Mesa student records.</span><Link href="/setup">Connect your workspace <ArrowUpRight size={13} /></Link></div>}
        <main className="main-content">{children}<NextChapter pathname={pathname} /></main>
      </div>
      <ChapterRail pathname={pathname} />
      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} links={groups.flatMap((group) => group.links.map(({ href, label }) => ({ href, label, group: group.label })))} />
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname === "/") return "Overview";
  const parts = pathname.split("/").filter(Boolean);
  // Record pages end in an ID; name them after their section instead (e.g. /materials/<id> → "Materials").
  const last = parts.at(-1) && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(parts.at(-1)!) ? parts.at(-2) : parts.at(-1);
  return last?.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? "Overview";
}
