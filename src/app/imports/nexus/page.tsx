import { AppShell } from "@/components/app-shell";
import { NexusImporter } from "@/components/nexus-importer";

export const dynamic = "force-dynamic";

// Member-approved, supervised import of what Nexus assignment pages show (see AGENTS.md).
export default function NexusImportPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Supervised import</div><h1>Import from Nexus</h1><p className="page-subtitle">Attach work shown on a Nexus assignment page: its details, submitted links and downloaded files.</p></div></div>
    <NexusImporter />
  </div></AppShell>;
}
