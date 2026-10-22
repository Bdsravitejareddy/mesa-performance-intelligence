import { NextResponse, type NextRequest } from "next/server";
import { syncMesaLms } from "@/lib/lms/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { describePendingMaterials } from "@/lib/materials/vision";
import { matchDriveSubmissions } from "@/lib/materials/submission-matching";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const started = Date.now();
  let sync: unknown;
  let syncFailed = false;
  try {
    sync = await syncMesaLms();
  } catch {
    syncFailed = true;
    sync = { error: "LMS sync failed. Check connector configuration and the latest sync status." };
  }
  // Describe newly flagged course slides with the remaining daily budget; failures are logged per material.
  let materialVision: unknown = null;
  try {
    materialVision = await describePendingMaterials(createAdminClient(), 280_000 - (Date.now() - started));
  } catch {
    materialVision = { error: "Material description did not run." };
  }
  // Recognise newly imported submissions in course folders and attach them as evidence.
  let driveSubmissions: unknown = null;
  try {
    driveSubmissions = await matchDriveSubmissions(createAdminClient(), Math.max(0, 290_000 - (Date.now() - started)));
  } catch {
    driveSubmissions = { error: "Drive submission matching did not run." };
  }
  return NextResponse.json({ sync, materialVision, driveSubmissions }, { status: syncFailed ? 502 : 200 });
}
