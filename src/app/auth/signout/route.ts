import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GUEST_COOKIE, endGuestSession, guestUntil, type GuestClaims } from "@/lib/guest";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const guestId = guestUntil(data?.claims as GuestClaims) && typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  await supabase.auth.signOut();
  // A guest's changes are undone and its temporary user removed as it leaves.
  if (guestId) await endGuestSession(createAdminClient(), guestId).catch(() => null);
  const response = NextResponse.redirect(new URL(guestId ? "/login?guest=ended" : "/login", request.url), { status: 303 });
  response.cookies.delete(GUEST_COOKIE);
  return response;
}
