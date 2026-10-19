import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAllowedEmails, hasSupabaseConfig, isAllowedEmail, isDemoMode } from "./config";

const publicPaths = ["/login", "/setup", "/unauthorized", "/auth/callback", "/api/auth/magic-link"];

export async function updateSession(request: NextRequest) {
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
