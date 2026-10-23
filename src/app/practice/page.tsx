import { AppShell } from "@/components/app-shell";
import { WeeklyPractice } from "@/components/weekly-practice";

export const dynamic = "force-dynamic";

export default function PracticePage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Every week</div><h1>Weekly practice</h1><p className="page-subtitle">Quiz and trick questions, a short case task aimed at your weakest skill, and two everyday prompts that show how you express yourself. About 20 minutes.</p></div></div>
    <WeeklyPractice />
  </div></AppShell>;
}
