import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { parseClifton, parseSixteenP } from "@/lib/tests/external";
import { parseIpipNeo } from "@/lib/tests/ipip-neo";
import { pdfText } from "@/lib/tests/pdf-text";

export const maxDuration = 60;

// Saves a result the member reports from 16Personalities or CliftonStrengths, or an IPIP-NEO result PDF.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  // An IPIP-NEO result arrives as its PDF and is read on the server; nothing is guessed if it cannot be read.
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const file = (await request.formData().catch(() => null))?.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Upload the result PDF (at most 10 MiB)." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "That file is not a PDF." }, { status: 400 });
    let text: string;
    try { text = await pdfText(bytes); } catch { return NextResponse.json({ error: "The PDF could not be read." }, { status: 422 }); }
    const result = parseIpipNeo(text);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 422 });
    const { error } = await supabase.from("external_assessments").insert({ kind: "ipip_neo", result });
    return error ? NextResponse.json({ error: "Could not save." }, { status: 500 }) : NextResponse.json({ ok: true, form: result.form, facets: result.facets.length, consistent: result.consistent, anomalies: result.anomalies }, { status: 201 });
  }
  const body = await request.json().catch(() => null) as { kind?: string; type?: string; percents?: Record<string, unknown>; themes?: unknown } | null;
  if (body?.kind === "16personalities") {
    const percents = Object.fromEntries(Object.entries(body.percents ?? {}).filter(([key, value]) => ["mind", "energy", "nature", "tactics", "identity"].includes(key) && Number.isFinite(Number(value)) && Number(value) >= 50 && Number(value) <= 100).map(([key, value]) => [key, Number(value)]));
    const result = parseSixteenP(String(body.type ?? ""), percents);
    if (!result) return NextResponse.json({ error: "Enter a type like INTJ-A or ENFP-T." }, { status: 400 });
    const { error } = await supabase.from("external_assessments").insert({ kind: "16personalities", result });
    return error ? NextResponse.json({ error: "Could not save." }, { status: 500 }) : NextResponse.json({ ok: true }, { status: 201 });
  }
  if (body?.kind === "cliftonstrengths") {
    const themes = parseClifton(Array.isArray(body.themes) ? body.themes.map(String) : String(body.themes ?? "").split(/[,\n]/));
    if (themes.length < 3) return NextResponse.json({ error: "Enter at least your top 3 themes, in order (e.g. Strategic, Learner, Achiever)." }, { status: 400 });
    const { error } = await supabase.from("external_assessments").insert({ kind: "cliftonstrengths", result: { themes } });
    return error ? NextResponse.json({ error: "Could not save." }, { status: 500 }) : NextResponse.json({ ok: true }, { status: 201 });
  }
  return NextResponse.json({ error: "Choose 16Personalities or CliftonStrengths." }, { status: 400 });
}
