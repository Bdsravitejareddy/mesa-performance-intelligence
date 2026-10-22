import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";
import { resolveProviderSettings } from "@/lib/ai/settings";
import { extractPdfPages, extractPptxSlides } from "@/lib/documents";
import { extractDocxPages } from "@/lib/office-documents";
import { extractClaims } from "@/lib/professional/claims";

export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(["resume", "work_experience", "project", "portfolio", "certification", "dashboard", "repository", "presentation", "achievement", "other"]);
const MIME: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
const MAX_BYTES = 20 * 1024 * 1024;

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return typeof userId === "string" ? { supabase, userId } : null;
}

async function extractText(bytes: Uint8Array, extension: string): Promise<string> {
  if (extension === "pdf") return (await extractPdfPages(bytes)).map((page) => page.text).join("\n\n");
  if (extension === "docx") return (await extractDocxPages(bytes)).map((page) => page.text).join("\n\n");
  return (await extractPptxSlides(bytes)).map((slide) => slide.text).join("\n\n");
}

// Adds a resume, project, portfolio item or certificate (file and/or link) and extracts its claims.
export async function POST(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Send the evidence as a form." }, { status: 400 });
  const kind = String(form.get("kind") ?? "");
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const description = String(form.get("description") ?? "").trim().slice(0, 4000);
  const url = String(form.get("url") ?? "").trim();
  const issuedBy = String(form.get("issuedBy") ?? "").trim().slice(0, 200);
  const occurredOn = /^\d{4}-\d{2}-\d{2}$/.test(String(form.get("occurredOn") ?? "")) ? String(form.get("occurredOn")) : null;
  const file = form.get("file");
  if (!KINDS.has(kind) || !title) return NextResponse.json({ error: "Choose a type and give it a title." }, { status: 400 });
  if (url && !/^https:\/\/[^\s]+$/.test(url)) return NextResponse.json({ error: "Links must start with https://." }, { status: 400 });

  let storagePath: string | null = null, mimeType: string | null = null, fileSize: number | null = null, text = description;
  if (file instanceof File && file.size > 0) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!MIME[extension] || file.size > MAX_BYTES) return NextResponse.json({ error: "Upload a PDF, Word or PowerPoint file up to 20 MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    try { text = [description, await extractText(bytes, extension)].filter(Boolean).join("\n\n"); }
    catch { return NextResponse.json({ error: "The file could not be read." }, { status: 422 }); }
    storagePath = `${auth.userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await auth.supabase.storage.from("evidence-files").upload(storagePath, bytes, { contentType: MIME[extension], upsert: false });
    if (uploadError) return NextResponse.json({ error: "The file could not be stored." }, { status: 500 });
    mimeType = MIME[extension]; fileSize = file.size;
  } else if (!url && !description) {
    return NextResponse.json({ error: "Add a file, a link or a description." }, { status: 400 });
  }

  const { data: evidence, error } = await auth.supabase.from("professional_evidence").insert({ user_id: auth.userId, kind, title, description, url: url || null, storage_path: storagePath, mime_type: mimeType, file_size: fileSize, extracted_text: text.slice(0, 200_000), issued_by: issuedBy, occurred_on: occurredOn }).select("id").single();
  if (error || !evidence) {
    if (storagePath) await auth.supabase.storage.from("evidence-files").remove([storagePath]);
    return NextResponse.json({ error: "The evidence could not be saved." }, { status: 500 });
  }

  // Claims are extracted only with current AI consent; otherwise the item is stored without claims.
  let claimsExtracted = 0;
  let note = "";
  const config = getAIProcessingConfig();
  const { data: consent } = await auth.supabase.from("ai_processing_consents").select("disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at").eq("user_id", auth.userId).maybeSingle();
  if (text.trim().length > 40 && config.configured && isAIConsentCurrent(consent, config)) {
    try {
      const { data: competencies } = await auth.supabase.from("competencies").select("id, name, domain_name");
      const claims = await extractClaims(text, (competencies ?? []).map((row) => ({ id: row.id, name: row.name, domain: row.domain_name })));
      if (claims.length) {
        const { error: claimError } = await auth.supabase.from("professional_claims").insert(claims.map((claim) => ({ user_id: auth.userId, evidence_id: evidence.id, claim: claim.claim, claim_type: claim.claimType, quantified: claim.quantified, competency_id: claim.competencyId, extracted_by: "ai", provider_model: resolveProviderSettings().model })));
        if (!claimError) claimsExtracted = claims.length;
      }
    } catch { note = "Saved; claim extraction failed and can be retried."; }
  } else if (text.trim().length > 40) {
    note = "Saved without claim extraction: accept the AI disclosure to extract claims.";
  }
  return NextResponse.json({ id: evidence.id, claimsExtracted, note }, { status: 201 });
}

// Deletes an evidence item, its stored file and its claims.
export async function DELETE(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Unknown item." }, { status: 400 });
  const { data: evidence } = await auth.supabase.from("professional_evidence").select("id, storage_path").eq("id", id).maybeSingle();
  if (!evidence) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (evidence.storage_path) {
    const { error } = await auth.supabase.storage.from("evidence-files").remove([evidence.storage_path]);
    if (error) return NextResponse.json({ error: "The stored file could not be deleted; nothing was removed." }, { status: 500 });
  }
  const { error } = await auth.supabase.from("professional_evidence").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "The record could not be deleted." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Marks a claim as supported by another evidence item, or withdraws it.
export async function PATCH(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { claimId?: unknown; status?: unknown; supportingEvidenceId?: unknown; note?: unknown; action?: unknown } | null;
  // "Confirm all": the member attests every open claim is accurate. Recorded as attested, not as evidence-backed.
  if (body?.action === "attest_all") {
    const { data, error } = await auth.supabase.from("professional_claims").update({ status: "attested", attested_at: new Date().toISOString(), supporting_evidence_id: null }).eq("status", "claimed").select("id");
    if (error) return NextResponse.json({ error: "Could not confirm the claims." }, { status: 400 });
    return NextResponse.json({ ok: true, confirmed: data?.length ?? 0 });
  }
  const claimId = typeof body?.claimId === "string" && UUID.test(body.claimId) ? body.claimId : "";
  const status = body?.status === "supported" || body?.status === "withdrawn" || body?.status === "claimed" || body?.status === "attested" ? body.status : null;
  const supportingEvidenceId = typeof body?.supportingEvidenceId === "string" && UUID.test(body.supportingEvidenceId) ? body.supportingEvidenceId : null;
  if (!claimId || !status || (status === "supported" && !supportingEvidenceId)) return NextResponse.json({ error: "Supported claims need a supporting evidence item." }, { status: 400 });
  const { error } = await auth.supabase.from("professional_claims").update({ status, supporting_evidence_id: status === "supported" ? supportingEvidenceId : null, supporting_note: typeof body?.note === "string" ? body.note.slice(0, 600) : "" }).eq("id", claimId);
  if (error) return NextResponse.json({ error: "Could not update the claim." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
