import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";
import { generateOverviewBrief } from "@/lib/insights/overview-brief";
import { TERMS, type TermChoice } from "@/lib/term";

export const maxDuration = 90;

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const config = getAIProcessingConfig();
  const { data: consent } = await supabase.from("ai_processing_consents").select("disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at").eq("user_id", userId).maybeSingle();
  if (!isAIConsentCurrent(consent, config)) return NextResponse.json({ error: "Accept the current AI processing notice first." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { term?: unknown } | null;
  const term = (TERMS as readonly string[]).includes(String(body?.term)) ? body!.term as TermChoice : "all";
  try {
    const result = await generateOverviewBrief(supabase, userId, term);
    return result ? NextResponse.json(result) : NextResponse.json({ error: "Not enough figures in this term to summarise yet." }, { status: 422 });
  } catch {
    return NextResponse.json({ error: "The summary could not be generated. Try again shortly." }, { status: 503 });
  }
}
