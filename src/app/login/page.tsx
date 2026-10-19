import Link from "next/link";
import { Activity, ShieldCheck, Sparkles } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="auth-page">
    <div className="auth-art"><div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" /><div className="auth-art-content">
      <Link href="/" className="brand-lockup auth-brand"><span className="brand-mark"><Activity size={18} /></span><span className="brand-copy"><strong>mesa</strong><small>PERFORMANCE INTELLIGENCE</small></span></Link>
      <div className="auth-quote"><span className="auth-kicker"><Sparkles size={14} /> LEARN WITH THE WHOLE PICTURE</span><h1>See what the score can’t tell you.</h1><p>Connect your coursework, evidence, and goals to understand what’s working and what to build next.</p></div>
      <div className="auth-art-footer"><span>COURSE-GROUNDED</span><i /> <span>EVIDENCE-LINKED</span><i /> <span>BUILT FOR GROWTH</span></div>
    </div></div>
    <section className="auth-form-side"><div className="auth-form-card"><div className="auth-form-icon"><ShieldCheck size={19} /></div><span className="auth-eyebrow">PRIVATE WORKSPACE</span><h2>Welcome back</h2><p>Sign in to your academic performance workspace.</p><LoginForm errorCode={error} /><div className="auth-security"><LockKeyholeText />Your course materials and marks stay in your private Supabase workspace.</div></div><div className="auth-copyright">MESA PERFORMANCE INTELLIGENCE <span>·</span> PRIVATE BY DESIGN</div></section>
  </main>;
}

function LockKeyholeText() { return <ShieldCheck size={13} />; }
