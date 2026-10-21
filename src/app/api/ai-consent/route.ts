import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { AI_DISCLOSURE_VERSION, getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";

async function currentUser() {
  if (!hasSupabaseConfig()) return { error: NextResponse.json({ error: "Connect Supabase before managing AI consent." }, { status: 503 }) };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return { error: NextResponse.json({ error: "Sign in to manage AI consent." }, { status: 401 }) };
  return { supabase, userId };
}

export async function GET() {
  const auth = await currentUser();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase.from("ai_processing_consents").select("disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at").eq("user_id", auth.userId).maybeSingle();
  if (error) return NextResponse.json({ error: "AI consent status is unavailable." }, { status: 503 });
  const config = getAIProcessingConfig();
  const consented = isAIConsentCurrent(data, config);
  return NextResponse.json({ configured: config.configured, providerHost: config.providerHost, model: config.model, retentionNotice: config.retentionNotice, disclosureVersion: config.disclosureVersion, consented });
}

export async function POST(request: Request) {
  const auth = await currentUser();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as { agree?: boolean; disclosureVersion?: string } | null;
  if (body?.agree !== true || body.disclosureVersion !== AI_DISCLOSURE_VERSION) return NextResponse.json({ error: "Review and accept the current AI processing disclosure." }, { status: 409 });
  const config = getAIProcessingConfig();
  if (!config.configured) return NextResponse.json({ error: "AI processing is unavailable until the server provider and retention disclosure are configured." }, { status: 503 });
  const { error } = await auth.supabase.from("ai_processing_consents").upsert({ user_id: auth.userId, disclosure_version: AI_DISCLOSURE_VERSION, configuration_fingerprint: config.configurationFingerprint, provider_host: config.providerHost, provider_model: config.model, agreed_at: new Date().toISOString(), revoked_at: null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Could not save AI consent." }, { status: 400 });
  return NextResponse.json({ consented: true, providerHost: config.providerHost, model: config.model, disclosureVersion: AI_DISCLOSURE_VERSION });
}

export async function DELETE() {
  const auth = await currentUser();
  if ("error" in auth) return auth.error;
  const { error } = await auth.supabase.from("ai_processing_consents").update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: "Could not revoke AI consent." }, { status: 400 });
  return NextResponse.json({ consented: false });
}
