import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError } from "@/lib/drive-sync/http";
import { githubAppConfig } from "@/lib/portfolio/github";

// Starts the GitHub App flow: authorise (and install, the first time), then GitHub returns to the callback.
export async function GET() {
  try {
    await requireWorkspaceMember();
    const config = githubAppConfig();
    if (!config.configured) return NextResponse.json({ error: "GitHub is not set up yet: add GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET and GITHUB_APP_SLUG in Vercel." }, { status: 503 });
    const state = randomBytes(24).toString("hex");
    // Authorise first: for an account that already installed the app this returns straight to the dashboard; the
    // callback sends a first-time account on to installation.
    const response = NextResponse.redirect(`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(config.callback)}&state=${state}`);
    response.cookies.set("mesa_github_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/github", maxAge: 600 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "Could not start GitHub." }, { status: error instanceof HttpError ? error.status : 500 });
  }
}
