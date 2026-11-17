import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { endExpiredGuests } from "@/lib/guest";
import { refreshBriefs, refreshExtras, refreshProjects, refreshSkillView } from "@/lib/refresh/extras";
import { handOffNow } from "@/lib/grading/chain";

export const maxDuration = 300;

// Chained from the last grading pass (and so from the daily cron and manual refresh). Acknowledges at once.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const stage = request.nextUrl.searchParams.get("stage");
  const pass = Math.max(1, Number(request.nextUrl.searchParams.get("pass") ?? 1) || 1);
  // Stages run one after another, each on its own invocation, so every stage reads what the one before it wrote:
  // feedback and behaviour readings → project evaluations (chained until done) → the AI skill view → the overview
  // summaries. Running them side by side meant the overview and skill view read yesterday's analyses.
  if (stage === "skills") after(async () => {
    await refreshSkillView(createAdminClient()).catch(() => undefined);
    await handOffNow("/api/cron/refresh?stage=briefs");
  });
  else if (stage === "briefs") after(async () => { await refreshBriefs(createAdminClient()).catch(() => 0); });
  else if (stage === "projects") after(async () => {
    const result = await refreshProjects(createAdminClient()).catch(() => ({ skipped: 0 }));
    // Keep going while projects were left for lack of time (at most five passes), then move on.
    await handOffNow(result.skipped > 0 && pass < 5 ? `/api/cron/refresh?stage=projects&pass=${pass + 1}` : "/api/cron/refresh?stage=skills");
  });
  else after(async () => {
    // Guest sessions left open past their time are undone before the day's analyses are rebuilt.
    await endExpiredGuests(createAdminClient()).catch(() => 0);
    await refreshExtras(createAdminClient(), 270_000).catch(() => undefined);
    await handOffNow("/api/cron/refresh?stage=projects");
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
