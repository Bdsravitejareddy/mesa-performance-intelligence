import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAllowedEmails, hasSupabaseConfig, isAllowedEmail, isDemoMode } from "./config";
import { guestBlockedPath, guestUntil, type GuestClaims } from "@/lib/guest";

const publicPaths = ["/login", "/setup", "/unauthorized", "/auth/callback", "/api/auth/magic-link", "/api/auth/guest"];
const machinePaths = new Set(["pair", "pair-request", "pair-status", "installer", "session", "inventory", "upload", "finalize", "checkpoint"]
  .map((name) => `/api/drive-agent/${name}`));
const cronPaths = new Set(["/api/cron/lms-sync", "/api/cron/grading", "/api/cron/refresh"]);

export async function updateSession(request: NextRequest) {
  // These exact routes return their own JSON authentication failures for Apps Script.
  if (machinePaths.has(request.nextUrl.pathname) || cronPaths.has(request.nextUrl.pathname)) return NextResponse.next({ request });
  if (isDemoMode() || !hasSupabaseConfig()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const isPublic = publicPaths.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`));

  if (!claims && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // A guest (marked in server-managed app_metadata) is a workspace member for its session's lifetime only, and never
  // reaches paths that leave the app or cannot be undone. Signing out stays open so an expired session is cleaned up.
  const guestEnds = guestUntil(claims as GuestClaims);
  if (claims && guestEnds) {
    const path = request.nextUrl.pathname;
    if (isPublic || path === "/auth/signout") return response;
    if (guestEnds.getTime() <= Date.now()) {
      const expiredUrl = request.nextUrl.clone();
      expiredUrl.pathname = "/login";
      expiredUrl.search = "?error=guest_expired";
      return NextResponse.redirect(expiredUrl);
    }
    if (guestBlockedPath(path)) return NextResponse.json({ error: "Not available in guest mode." }, { status: 403 });
    return response;
  }

  const allowlistConfigured = getAllowedEmails().length > 0;
  const claimEmail = typeof claims?.email === "string" ? claims.email.toLowerCase() : "";
  if (claims && (!allowlistConfigured || !isAllowedEmail(claimEmail)) && !isPublic) {
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = allowlistConfigured ? "/unauthorized" : "/setup";
    deniedUrl.search = "";
    return NextResponse.redirect(deniedUrl);
  }

  return response;
}
