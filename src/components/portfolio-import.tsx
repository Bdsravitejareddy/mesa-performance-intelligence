"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Uploads the JSON file written by scripts/collect-portfolio.mjs; parsing and checks happen on the server.
export function PortfolioImport() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  async function upload(file: File) {
    setMessage("Importing…");
    const text = await file.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { setMessage("That file is not valid JSON."); return; }
    const response = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { error?: string; github?: number; vercel?: number };
    if (!response.ok) { setMessage(result.error ?? "Import failed."); return; }
    setMessage(`Imported ${result.github} repositories and ${result.vercel} Vercel projects.`);
    router.refresh();
  }
  return <div className="portfolio-import">
    <label className="button button-secondary">Upload portfolio file<input type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>
    {message && <small role="status">{message}</small>}
  </div>;
}
