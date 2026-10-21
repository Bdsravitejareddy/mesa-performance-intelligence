import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError } from "@/lib/drive-sync/http";
import { syncMesaLms } from "@/lib/lms/sync";

export const maxDuration = 60;

export async function POST() {
  try {
    await requireWorkspaceMember();
    return NextResponse.json(await syncMesaLms());
  } catch (error) {
    const message = error instanceof HttpError ? error.message : error instanceof Error && /not configured/i.test(error.message) ? error.message : "LMS sync failed. Check the latest sync status and server configuration.";
    const status = error instanceof HttpError ? error.status : /not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
