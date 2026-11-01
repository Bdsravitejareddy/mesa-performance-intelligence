"use client";

import { useState } from "react";
import { ArrowRight, KeyRound, UserRound } from "lucide-react";

const NOTES: Record<string, string> = {
  guest_expired: "Your guest session reached its time limit. Its changes are undone; sign in again to start a new one.",
  ended: "You signed out, and every change from the guest session was undone.",
};

// Guest sign-in with the shared username and password. Changes made as a guest are undone on sign-out.
export function GuestLoginForm({ notice }: { notice?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Guest sign-in failed.");
      window.location.assign("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Guest sign-in failed.");
      setBusy(false);
    }
  }

  return <form className="login-form guest-login-form" onSubmit={submit}>
    {notice && NOTES[notice] && <p className="auth-success">{NOTES[notice]}</p>}
    <label className="field"><span>Username</span><div className="login-input-wrap"><UserRound size={15} /><input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></div></label>
    <label className="field"><span>Password</span><div className="login-input-wrap"><KeyRound size={15} /><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div></label>
    <button className="button button-secondary login-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in as guest"}<ArrowRight size={15} /></button>
    {error && <p className="auth-error">{error}</p>}
    <p className="login-foot">Guests see the workspace and can try changes; everything is reset when they sign out.</p>
  </form>;
}
