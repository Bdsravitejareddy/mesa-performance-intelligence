import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";

export default function SetupPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> PRIVATE WORKSPACE SETUP</div><h1>Connect your workspace</h1><p className="page-subtitle">The dashboard is ready to connect to your Supabase project. This repository does not contain credentials or a linked production project.</p></div></div>
    <div className="section-two-column"><div className="content-panel"><h2>Setup checklist</h2><p>Complete these steps locally and in your own Supabase/Vercel accounts. Never commit secret keys.</p>
      <SetupStep done={demoMode} number="01" title="Create or select your Supabase project" detail="Use a project intended for this app. No existing project was changed." />
      <SetupStep done={false} number="02" title="Apply the database migration" detail="Run the Supabase CLI migration after linking the intended project." />
      <SetupStep done={false} number="03" title="Set private environment variables" detail="Add the project URL, publishable key, owner email, and model-provider settings in Vercel." />
      <SetupStep done={false} number="04" title="Create the owner account" detail="Add the configured owner email in Supabase Auth, then request a magic link here." />
      <SetupStep done={false} number="05" title="Review the LMS source interface" detail="Keep daily sync disabled until an official or permitted LMS export/API is confirmed." />
      <div className="setup-command"><code>npx supabase link --project-ref YOUR_PROJECT_REF<br />npx supabase db push</code><span>Run only after selecting your intended project and verifying the target reference.</span></div>
    </div><aside className="content-panel"><div className="helper-card setup-helper"><ShieldCheck size={19} /><h3>Privacy guardrails</h3><p>All application tables are owner-scoped with RLS. Uploaded files use a private bucket and user-folder policies. The app never ships a service key to the browser.</p><Link href="/login">Open sign in <span>→</span></Link></div><div className="info-callout"><Circle size={14} />Hosted AI evaluation is disabled until you configure a model provider and approve sending relevant excerpts.</div><div className="info-callout"><Circle size={14} />The account has an existing Supabase project, but it has not been linked or modified for this app.</div></aside></div>
  </div></AppShell>;
}

function SetupStep({ done, number, title, detail }: { done: boolean; number: string; title: string; detail: string }) {
  return <div className="setup-step"><span className={`setup-step-icon${done ? " done" : ""}`}>{done ? <CheckCircle2 size={15} /> : <span>{number}</span>}</span><span><strong>{title}</strong><small>{detail}</small></span></div>;
}
