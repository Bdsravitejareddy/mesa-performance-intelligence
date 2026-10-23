import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshExtras } from "@/lib/refresh/extras";

export const maxDuration = 300;

// Chained from the last grading pass (and so from the daily cron and manual refresh). Acknowledges at once.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  after(async () => { await refreshExtras(createAdminClient(), 285_000).catch(() => undefined); });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
