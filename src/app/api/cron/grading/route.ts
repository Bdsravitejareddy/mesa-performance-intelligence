import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeSubmissions } from "@/lib/grading/run";

export const maxDuration = 300;

// Nightly, after the LMS sync and Drive submission matching: grade every new or changed submission.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  try {
    const outcomes = await gradeSubmissions(createAdminClient(), 285_000);
    return NextResponse.json({ graded: outcomes.filter((row) => row.status === "graded").length, outcomes });
  } catch {
    return NextResponse.json({ error: "Grading did not run." }, { status: 500 });
  }
}
