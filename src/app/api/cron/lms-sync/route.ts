import { NextResponse, type NextRequest } from "next/server";
import { syncMesaLms } from "@/lib/lms/sync";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await syncMesaLms());
  } catch {
    return NextResponse.json({ error: "LMS sync failed. Check connector configuration and the latest sync status." }, { status: 502 });
  }
}
