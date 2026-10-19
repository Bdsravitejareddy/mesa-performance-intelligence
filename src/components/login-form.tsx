"use client";

import { useState } from "react";
import { ArrowRight, Check, LockKeyhole, Mail } from "lucide-react";

export function LoginForm({ errorCode }: { errorCode?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(errorCode ? "That sign-in link is missing or expired. Request a new one." : "");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to send a sign-in link.");
      setMessage("Check your inbox for a private sign-in link.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send a sign-in link.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    <label className="field"><span>Email address</span><div className="login-input-wrap"><Mail size={15} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div></label>
    <button className="button button-primary login-submit" disabled={busy}>{busy ? "Sending link…" : "Send secure sign-in link"}<ArrowRight size={15} /></button>
    {message && <p className="auth-success"><Check size={14} />{message}</p>}
    {error && <p className="auth-error">{error}</p>}
    <p className="login-foot"><LockKeyhole size={12} /> Only the configured workspace account can sign in.</p>
  </form>;
}
