import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { getAllowedEmails, hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const configured = hasSupabaseConfig();
  const ownerConfigured = getAllowedEmails().length > 0;
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> PRIVATE WORKSPACE SETUP</div><h1>Connect your workspace</h1><p className="page-subtitle">The dashboard is ready to connect to your Supabase project. This repository does not contain credentials or a linked production project.</p></div></div>
    <div className="info-callout" role="status">{configured ? "Supabase connection settings are present. This does not yet verify the database migration or imported records." : "Supabase connection settings are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to this Vercel deployment."}</div>
    <div className="section-two-column"><div className="content-panel"><h2>Setup checklist</h2><p>Complete these steps locally and in your own Supabase/Vercel accounts. Never commit secret keys.</p>
      <SetupStep done={false} number="01" title="Create or select your Supabase project" detail="Select the database intended for Mesa before applying its migration." />
      <SetupStep done={false} number="02" title="Apply the database migration" detail="Run the Supabase CLI migration after linking the intended project." />
      <SetupStep done={configured && ownerConfigured && !demoMode} number="03" title="Set workspace environment variables" detail="Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, APP_ALLOWED_EMAILS, and NEXT_PUBLIC_DEMO_MODE=false in Vercel, then redeploy." />
      <SetupStep done={false} number="04" title="Sign in with an approved account" detail="Request a magic link with an invited email. The first successful sign-in creates its account; both approved emails share the same workspace." />
      <SetupStep done={false} number="05" title="Import course and assessment records" detail="No LMS data is included in the code. Once signed in, add courses, upload materials, and enter official marks/feedback. Automated LMS sync still requires a verified interface." />
      <div className="setup-command"><code>npx supabase link --project-ref YOUR_PROJECT_REF<br />npx supabase db push</code><span>Run only after selecting your intended project and verifying the target reference.</span></div>
    </div><aside className="content-panel"><div className="helper-card setup-helper"><ShieldCheck size={19} /><h3>Privacy guardrails</h3><p>Database and file-access rules restrict the shared workspace to verified invited accounts. The app never ships a service key to the browser.</p><Link href="/login">Open sign in <span>→</span></Link></div><div className="info-callout"><Circle size={14} />Hosted AI evaluation is disabled until you configure a model provider and approve sending relevant excerpts.</div><div className="info-callout"><Circle size={14} />Connecting a database enables storage. Importing course materials and assessment records is a separate step.</div></aside></div>
  </div></AppShell>;
}

function SetupStep({ done, number, title, detail }: { done: boolean; number: string; title: string; detail: string }) {
  return <div className="setup-step"><span className={`setup-step-icon${done ? " done" : ""}`}>{done ? <CheckCircle2 size={15} /> : <span>{number}</span>}</span><span><strong>{title}</strong><small>{detail}</small></span></div>;
}
