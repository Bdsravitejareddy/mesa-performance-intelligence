import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError } from "@/lib/drive-sync/http";
import { githubAppConfig } from "@/lib/portfolio/github";

// Starts the GitHub App flow: install (choosing repositories) and authorise, then GitHub returns to the callback.
export async function GET() {
  try {
    await requireWorkspaceMember();
    const config = githubAppConfig();
    if (!config.configured) return NextResponse.json({ error: "GitHub is not set up yet: add GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET and GITHUB_APP_SLUG in Vercel." }, { status: 503 });
    const state = randomBytes(24).toString("hex");
    const response = NextResponse.redirect(`https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new?state=${state}`);
    response.cookies.set("mesa_github_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/github", maxAge: 600 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "Could not start GitHub." }, { status: error instanceof HttpError ? error.status : 500 });
  }
}
