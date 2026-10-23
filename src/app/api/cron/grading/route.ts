import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeSubmissions } from "@/lib/grading/run";
import { continueGrading, handOff, hasLeftover, MAX_PASSES } from "@/lib/grading/chain";
import { generateOverviewBrief } from "@/lib/insights/overview-brief";
import type { TermChoice } from "@/lib/term";

export const maxDuration = 300;

// Nightly (GET from Vercel Cron) and chained passes (POST): grade every new or changed submission. A pass that
// runs out of time hands off to the next; the last pass refreshes the overview summaries.
const authorised = (request: NextRequest) => { const secret = process.env.CRON_SECRET; return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`; };
const passOf = (request: NextRequest) => Math.max(1, Math.min(MAX_PASSES, Number(request.nextUrl.searchParams.get("pass") ?? 1) || 1));

async function runPass(pass: number) {
  const client = createAdminClient();
  try {
    const outcomes = await gradeSubmissions(client, 270_000);
    const chained = hasLeftover(outcomes) && continueGrading(pass + 1);
    let briefs = 0;
    if (!chained) {
      const { data: owner } = await client.from("sync_runs").select("user_id").order("started_at", { ascending: false }).limit(1).maybeSingle();
      for (const term of ["all", "Term 1", "Term 2"] as TermChoice[]) {
        try { if (owner && await generateOverviewBrief(client, owner.user_id as string, term)) briefs += 1; } catch { /* a term without figures is skipped */ }
      }
      // Grading is complete: GitHub, project evaluations and the behaviour readings refresh next.
      handOff("/api/cron/refresh");
    }
    return NextResponse.json({ pass, graded: outcomes.filter((row) => row.status === "graded").length, chained, briefs, outcomes });
  } catch {
    return NextResponse.json({ error: "Grading did not run." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return new Response("Unauthorized", { status: 401 });
  return runPass(passOf(request));
}

// A chained pass acknowledges at once and grades in the background, so the previous pass's hand-off never waits on it.
export async function POST(request: NextRequest) {
  if (!authorised(request)) return new Response("Unauthorized", { status: 401 });
  const number = passOf(request);
  after(() => runPass(number));
  return NextResponse.json({ pass: number, accepted: true }, { status: 202 });
}
