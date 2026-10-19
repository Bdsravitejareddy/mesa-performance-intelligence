import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAllowedEmails, hasSupabaseConfig, isAllowedEmail } from "@/lib/supabase/config";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (!getAllowedEmails().length) return NextResponse.json({ error: "Set APP_ALLOWED_EMAILS before enabling sign-in." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !isAllowedEmail(email)) return NextResponse.json({ error: "This account is not on the workspace allowlist." }, { status: 403 });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: new URL("/auth/callback", request.url).toString() },
  });
  if (error) return NextResponse.json({ error: "Could not send a sign-in link. Check the Supabase email provider and allowed callback URL." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
