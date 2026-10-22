import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";
import { autoTagAssessments } from "@/lib/competency/auto-tag";

export const maxDuration = 300;

// Maps every untagged assessment to competencies with Gemini.
export async function POST() {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const config = getAIProcessingConfig();
  const { data: consent } = await supabase.from("ai_processing_consents").select("disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at").eq("user_id", userId).maybeSingle();
  if (!config.configured || !isAIConsentCurrent(consent, config)) return NextResponse.json({ error: "Accept the AI processing disclosure first." }, { status: 403 });
  try {
    return NextResponse.json(await autoTagAssessments(supabase, userId));
  } catch (failure) {
    return NextResponse.json({ error: failure instanceof Error ? failure.message : "Auto-tagging failed." }, { status: 502 });
  }
}
