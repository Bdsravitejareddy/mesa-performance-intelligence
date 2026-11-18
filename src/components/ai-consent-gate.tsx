"use client";

import { useEffect, useState, type ReactNode } from "react";

type Consent = { configured: boolean; providerHost: string; model: string; retentionNotice: string; disclosureVersion: string; consented: boolean };

// Shows children only once AI processing is configured and the signed-in account has accepted the current disclosure.
export function AIConsentGate({ purpose, children }: { purpose: string; children: ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    // A check that never answers says so, with a retry, rather than leaving "Checking…" on screen indefinitely.
    fetch("/api/ai-consent", { cache: "no-store", signal: AbortSignal.timeout(12_000) }).then(async (response) => { if (!response.ok) throw new Error("AI readiness could not be checked."); const value = await response.json() as Consent; if (active) setConsent(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error && reason.name === "TimeoutError" ? "The AI readiness check took too long. Try again in a moment." : reason instanceof Error ? reason.message : "AI readiness could not be checked."); });
    return () => { active = false; };
  }, [attempt]);
  async function accept() {
    if (!consent) return;
    const response = await fetch("/api/ai-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agree: true, disclosureVersion: consent.disclosureVersion }) });
    if (!response.ok) { setError(((await response.json()) as { error?: string }).error ?? "Consent could not be saved."); return; }
    setConsent({ ...consent, consented: true });
  }
  if (error) return <p className="form-error" role="alert">{error} <button className="button button-secondary" type="button" onClick={() => { setError(""); setConsent(null); setAttempt((value) => value + 1); }}>Try again</button></p>;
  if (!consent) return <p className="empty-hint">Checking AI readiness…</p>;
  if (!consent.configured) return <div className="info-callout"><span>AI evaluation is not configured on the server.</span></div>;
  if (!consent.consented) return <div className="summary-state"><strong>Review AI processing</strong><p>{purpose} The text you choose is sent to {consent.providerHost} ({consent.model}).</p>{consent.retentionNotice && <p>{consent.retentionNotice}</p>}<label><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> I reviewed the processing and retention disclosure.</label><button className="button button-primary" type="button" disabled={!agreed} onClick={() => void accept()}>Accept and continue</button></div>;
  return <>{children}</>;
}
