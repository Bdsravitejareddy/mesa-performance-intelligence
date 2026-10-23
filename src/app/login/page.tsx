import { Activity, BrainCircuit, FileSearch, ShieldCheck, Target } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { IntelligenceVisual } from "@/components/intelligence-visual";
import { ParallaxHero, RotatingWord } from "@/components/motion";

// The same phrases as the feature list, so the page speaks with one voice.
const MARQUEE = ["Every conclusion explained", "Blind evaluation", "Role readiness from real job postings", "Course-grounded evaluation", "Evidence, not verdicts", "Private by design", "AI-described slides", "Growth you can verify"];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="lx-page" data-theme="nature" aria-label="Sign in to Mesa Performance Intelligence">
    <ParallaxHero className="lx-scene">
      <div className="lx-layout">
        <header className="lx-top"><span className="brand-lockup lx-brand"><span className="brand-mark"><Activity size={18} /></span><span className="brand-copy"><strong>mesa</strong><small>PERFORMANCE INTELLIGENCE</small></span></span><span className="lx-pill"><ShieldCheck size={13} /> Private workspace</span></header>
        <section className="lx-copy">
          <span className="lx-kicker">Learn with the whole picture</span>
          <h1><span className="sr-only">See your strengths, gaps, next moves, evidence and potential.</span><span aria-hidden="true">See your{" "}<br /><RotatingWord words={["strengths.", "gaps.", "next moves.", "evidence.", "potential."]} /></span></h1>
          <p>Marks, feedback, course material, your work and your target roles — turned into conclusions you can inspect, question and act on.</p>
          <ul className="lx-features" aria-label="What the workspace does">
            <li><FileSearch size={15} /><span><b>Every conclusion explained</b><small>Evidence, benchmark and limits</small></span></li>
            <li><BrainCircuit size={15} /><span><b>Blind evaluation</b><small>Judged before reputation</small></span></li>
            <li><Target size={15} /><span><b>Role readiness</b><small>From real job postings</small></span></li>
          </ul>
        </section>
        <div className="lx-visual" aria-hidden="true"><IntelligenceVisual /></div>
        <aside className="lx-example" aria-label="Illustrative example of a graded result">
          <span className="lx-card-eyebrow">Illustrative example — not real data</span>
          <dl><div><dt>Official mark</dt><dd>78</dd></div><div><dt>AI, graded blind</dt><dd>81</dd></div><div><dt>Questions answered</dt><dd>6 of 7</dd></div></dl>
          <small>Every figure comes with its evidence, benchmark and limits.</small>
        </aside>
        <section className="lx-card" aria-labelledby="sign-in-title">
          <span className="lx-card-eyebrow">Welcome back</span>
          <h2 id="sign-in-title">Sign in</h2>
          <p>We&apos;ll email you a one-time secure link. No password to remember.</p>
          <LoginForm errorCode={error} />
        </section>
      </div>
      <div className="lx-marquee" aria-hidden="true"><div className="lx-marquee-track">{[...MARQUEE, ...MARQUEE].map((item, index) => <span key={index}>{item}<i /></span>)}</div></div>
    </ParallaxHero>
  </main>;
}
