import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshExtras, refreshProjects, refreshSkillView } from "@/lib/refresh/extras";
import { handOff } from "@/lib/grading/chain";

export const maxDuration = 300;

// Chained from the last grading pass (and so from the daily cron and manual refresh). Acknowledges at once.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  // Stages on separate runs: GitHub and readings; the AI skill view; project evaluation, chained until done.
  const stage = request.nextUrl.searchParams.get("stage");
  const pass = Math.max(1, Number(request.nextUrl.searchParams.get("pass") ?? 1) || 1);
  if (stage === "skills") after(async () => { await refreshSkillView(createAdminClient()).catch(() => undefined); });
  else if (stage === "projects") after(async () => {
    const result = await refreshProjects(createAdminClient()).catch(() => ({ skipped: 0 }));
    // Keep going while projects were left for lack of time (at most five passes).
    if (result.skipped > 0 && pass < 5) handOff(`/api/cron/refresh?stage=projects&pass=${pass + 1}`);
  });
  // The skill view and projects start on their own runs straight away, so a long stage never blocks them.
  else { handOff("/api/cron/refresh?stage=skills"); handOff("/api/cron/refresh?stage=projects"); after(async () => { await refreshExtras(createAdminClient(), 285_000).catch(() => undefined); }); }
  return NextResponse.json({ accepted: true }, { status: 202 });
}
