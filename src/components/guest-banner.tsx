"use client";

import { useEffect, useState } from "react";
import { LogOut, UserRound } from "lucide-react";

const COOKIE = "mesa_guest_until";

// Shown only in a guest session. The cookie is a display hint; access is decided on the server.
export function GuestBanner() {
  const [until, setUntil] = useState<Date | null>(null);
  useEffect(() => {
    const raw = document.cookie.split("; ").find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    const date = raw ? new Date(decodeURIComponent(raw)) : null;
    if (date && !Number.isNaN(date.getTime()) && date.getTime() > Date.now()) setUntil(date);
  }, []);
  if (!until) return null;
  return <div className="demo-banner guest-banner" role="status">
    <span className="demo-banner-icon"><UserRound size={14} /></span>
    <strong>Guest mode</strong>
    <span>Try anything — every change you make is undone when you sign out (or at {until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}). Syncing, connections and AI runs are off.</span>
    <form action="/auth/signout" method="post"><button className="guest-signout" type="submit"><LogOut size={13} /> Sign out and reset</button></form>
  </div>;
}
