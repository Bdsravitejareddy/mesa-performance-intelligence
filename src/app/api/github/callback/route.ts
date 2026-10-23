import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { createClient } from "@/lib/supabase/server";
import { collectGithub, exchangeCode, githubAppConfig } from "@/lib/portfolio/github";

export const maxDuration = 120;

// GitHub returns here after the member installs and authorises the app. The short-lived user token collects a
// read-only summary, which is stored under the member's own session; the token itself is discarded.
export async function GET(request: NextRequest) {
  const config = githubAppConfig();
  const back = (query: string) => NextResponse.redirect(`${config.callback.replace(/\/api\/github\/callback$/, "")}/professional?${query}`);
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const expected = request.cookies.get("mesa_github_state")?.value;
  if (!config.configured) return back("github=not_configured");
  if (!state || !expected || state !== expected) return back("github=invalid");
  // An app that was already installed returns from its settings without a code: authorise to get one.
  if (!code) return NextResponse.redirect(`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(config.callback)}&state=${state}`);
  try {
    const { userId } = await requireWorkspaceMember();
    const token = await exchangeCode(code);
    const { rows } = await collectGithub(token, Date.now() + 90_000);
    const supabase = await createClient();
    if (rows.length) {
      const { error } = await supabase.from("portfolio_items").upsert(rows.map((row) => ({ ...row, user_id: userId, collected_at: new Date().toISOString() })), { onConflict: "source,external_id" });
      if (error) return back("github=save_failed");
    }
    const response = back(`github=imported&repos=${rows.length}`);
    response.cookies.delete({ name: "mesa_github_state", path: "/api/github" });
    return response;
  } catch (error) {
    // The message only: it never contains the token or the code.
    console.error("GitHub import failed:", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return back("github=failed");
  }
}
