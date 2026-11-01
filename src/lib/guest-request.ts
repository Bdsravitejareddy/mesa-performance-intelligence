import { guestUntil, type GuestClaims } from "@/lib/guest";

// True when the current request is signed in as a guest. Outside a request (cron, background work) it is false.
export async function isGuestRequest(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    if (!store.getAll().some((cookie) => cookie.name.startsWith("sb-"))) return false;
    const { createClient } = await import("@/lib/supabase/server");
    const { data } = await (await createClient()).auth.getClaims();
    return guestUntil(data?.claims as GuestClaims) !== null;
  } catch {
    return false;
  }
}
