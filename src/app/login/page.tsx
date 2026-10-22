import { Activity, BrainCircuit, FileSearch, ShieldCheck, Target } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { IntelligenceVisual } from "@/components/intelligence-visual";
import { ParallaxHero, RotatingWord } from "@/components/motion";

const MARQUEE = ["Course-grounded evaluation", "Evidence, not verdicts", "Blind quality checks", "Target-role readiness", "Every conclusion explained", "Private by design", "AI-described slides", "Growth you can verify"];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="lx-page" data-theme="nature">
    <ParallaxHero className="lx-scene">
      <div className="lx-layout">
        <header className="lx-top"><span className="brand-lockup lx-brand"><span className="brand-mark"><Activity size={18} /></span><span className="brand-copy"><strong>mesa</strong><small>PERFORMANCE INTELLIGENCE</small></span></span><span className="lx-pill"><ShieldCheck size={13} /> Private workspace</span></header>
        <section className="lx-copy">
          <span className="lx-kicker">01 / Learn with the whole picture</span>
          <h1>See your<br /><RotatingWord words={["strengths.", "gaps.", "next moves.", "evidence.", "potential."]} /></h1>
          <p>Marks, feedback, course material, your work and your target roles — turned into conclusions you can inspect, question and act on.</p>
          <ul className="lx-features">
            <li><FileSearch size={15} /><span><b>Every conclusion explained</b><small>Evidence, benchmark and limits</small></span></li>
            <li><BrainCircuit size={15} /><span><b>Blind evaluation</b><small>Judged before reputation</small></span></li>
            <li><Target size={15} /><span><b>Role readiness</b><small>From real job postings</small></span></li>
          </ul>
        </section>
        <div className="lx-visual"><IntelligenceVisual /></div>
        <section className="lx-card">
          <span className="lx-card-eyebrow">Welcome back</span>
          <h2>Sign in</h2>
          <p>We&apos;ll email you a one-time secure link. No password to remember.</p>
          <LoginForm errorCode={error} />
        </section>
      </div>
      <div className="lx-marquee" aria-hidden="true"><div className="lx-marquee-track">{[...MARQUEE, ...MARQUEE].map((item, index) => <span key={index}>{item}<i /></span>)}</div></div>
    </ParallaxHero>
  </main>;
}
