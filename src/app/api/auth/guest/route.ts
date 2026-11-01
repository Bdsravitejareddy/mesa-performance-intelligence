import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { GUEST_COOKIE, clientHash, endExpiredGuests, guestCredentialsMatch, newGuestIdentity } from "@/lib/guest";

// Guest sign-in (member-requested; see AGENTS.md): checks the shared username and the server-only GUEST_PASSWORD,
// limits failed attempts, then creates a short-lived guest user and signs it in without sending any email.
export async function POST(request: NextRequest) {
  const configured = process.env.GUEST_PASSWORD;
  if (!hasSupabaseConfig() || !configured) return NextResponse.json({ error: "Guest sign-in is not set up." }, { status: 503 });
  const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const admin = createAdminClient();
  const client = clientHash(request.headers.get("x-forwarded-for"));
  const { data: allowed } = await admin.rpc("guest_login_allowed", { p_client_hash: client });
  if (allowed !== true) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  const ok = guestCredentialsMatch(String(body?.username ?? ""), String(body?.password ?? ""), configured);
  await admin.rpc("record_guest_login", { p_client_hash: client, p_succeeded: ok });
  if (!ok) return NextResponse.json({ error: "That username or password is not right." }, { status: 401 });

  // Sessions whose tabs were closed without signing out are undone first.
  await endExpiredGuests(admin).catch(() => 0);
  const { email, until } = newGuestIdentity();
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { guest: true, guest_until: until } });
  if (createError || !created.user) return NextResponse.json({ error: "A guest session could not be started." }, { status: 500 });
  const { error: startError } = await admin.rpc("start_guest_session", { p_user_id: created.user.id, p_email: email, p_expires_at: until });
  if (startError) { await admin.auth.admin.deleteUser(created.user.id).catch(() => null); return NextResponse.json({ error: "A guest session could not be started." }, { status: 500 }); }
  // A one-time link is generated (not emailed) and redeemed here, which sets the guest's session cookies.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const supabase = await createClient();
  const { error: verifyError } = linkError || !link.properties?.hashed_token ? { error: linkError ?? new Error("no token") } : await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (verifyError) { await admin.rpc("end_guest_session", { p_user_id: created.user.id }); await admin.auth.admin.deleteUser(created.user.id).catch(() => null); return NextResponse.json({ error: "A guest session could not be started." }, { status: 500 }); }
  const response = NextResponse.json({ ok: true, until });
  // Read by the app shell to show the guest banner; access itself is decided on the server.
  response.cookies.set(GUEST_COOKIE, until, { path: "/", sameSite: "lax", secure: true, expires: new Date(until) });
  return response;
}
