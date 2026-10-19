import { AppShell } from "@/components/app-shell";
import { QualityChecker } from "@/components/quality-checker";

export default function QualityCheckPage() {
  return <AppShell demoMode={process.env.NEXT_PUBLIC_DEMO_MODE === "true"}><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> OBJECTIVE DRAFT CHECKS</div><h1>Quality checker</h1><p className="page-subtitle">Review simple structure and arithmetic signals before you submit.</p></div></div><section className="content-panel"><QualityChecker /></section></div></AppShell>;
}
