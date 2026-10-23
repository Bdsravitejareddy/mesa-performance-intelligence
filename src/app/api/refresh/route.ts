import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError } from "@/lib/drive-sync/http";
import { handOff } from "@/lib/grading/chain";

// "Refresh everything" from the dashboard: the LMS sync, Drive submission matching and mapping, then grading,
// then GitHub, project evaluations and the behaviour readings — each stage on its own server run.
export async function POST() {
  try {
    await requireWorkspaceMember();
    if (!handOff("/api/cron/lms-sync?chain=1")) return NextResponse.json({ error: "The server refresh is not configured." }, { status: 503 });
    return NextResponse.json({ started: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "Could not start the refresh." }, { status: error instanceof HttpError ? error.status : 500 });
  }
}
