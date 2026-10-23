import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshExtras, refreshSkillView } from "@/lib/refresh/extras";
import { handOff } from "@/lib/grading/chain";

export const maxDuration = 300;

// Chained from the last grading pass (and so from the daily cron and manual refresh). Acknowledges at once.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  // Two stages on separate runs: GitHub, projects and readings; then the AI skill view.
  const stage = request.nextUrl.searchParams.get("stage");
  if (stage === "skills") after(async () => { await refreshSkillView(createAdminClient()).catch(() => undefined); });
  // The skill view starts on its own run straight away, so a long first stage can never stop it from running.
  else { handOff("/api/cron/refresh?stage=skills"); after(async () => { await refreshExtras(createAdminClient(), 285_000).catch(() => undefined); }); }
  return NextResponse.json({ accepted: true }, { status: 202 });
}
