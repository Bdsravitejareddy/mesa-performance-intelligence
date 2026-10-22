import "server-only";
import { randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { DriveSyncStore } from "./store";
import { HttpError } from "./http";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HEX64 = /^[a-f0-9]{64}$/;
const LIFETIME_MS = 15 * 60_000;

export function displayCode(): string {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

// Called by an unpaired script. Only the hash of the script's own code is stored.
export async function requestPairing(codeHash: unknown) {
  if (typeof codeHash !== "string" || !HEX64.test(codeHash)) throw new HttpError(400, "A code hash is required.");
  const client = createAdminClient();
  const since = new Date(Date.now() - LIFETIME_MS).toISOString();
  const { count } = await client.from("drive_pairing_requests").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= 20) throw new HttpError(429, "Too many pairing requests. Try again in 15 minutes.");
  const code = displayCode();
  const expiresAt = new Date(Date.now() + LIFETIME_MS).toISOString();
  const { error } = await client.from("drive_pairing_requests").insert({ code_hash: codeHash, display_code: code, expires_at: expiresAt });
  if (error) throw new HttpError(409, "This pairing request already exists.");
  return { displayCode: code, expiresAt };
}

export async function pairingStatus(codeHash: unknown) {
  if (typeof codeHash !== "string" || !HEX64.test(codeHash)) throw new HttpError(400, "A code hash is required.");
  const { data } = await createAdminClient().from("drive_pairing_requests").select("approved_at, expires_at").eq("code_hash", codeHash).maybeSingle();
  if (!data) throw new HttpError(404, "Unknown pairing request.");
  return { approved: Boolean(data.approved_at), expired: Date.parse(data.expires_at as string) <= Date.now() };
}

export async function pendingPairings() {
  const { data } = await createAdminClient().from("drive_pairing_requests").select("id, display_code, created_at, expires_at").is("approved_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(10);
  return (data ?? []).map((row) => ({ id: row.id as string, displayCode: row.display_code as string, createdAt: row.created_at as string, expiresAt: row.expires_at as string }));
}

// A member approves the display code shown by the script: the connection gets a pairing for that hash.
export async function approvePairing(requestId: string, connectionId: string, userId: string) {
  const client = createAdminClient();
  const { data: request } = await client.from("drive_pairing_requests").select("id, code_hash, expires_at, approved_at").eq("id", requestId).maybeSingle();
  if (!request || request.approved_at || Date.parse(request.expires_at as string) <= Date.now()) throw new HttpError(409, "This pairing request has expired or was already used.");
  await new DriveSyncStore(client).issuePairing(connectionId, request.code_hash as string, request.expires_at as string);
  const { error } = await client.from("drive_pairing_requests").update({ approved_connection_id: connectionId, approved_by: userId, approved_at: new Date().toISOString() }).eq("id", requestId).is("approved_at", null);
  if (error) throw new HttpError(500, "The approval could not be saved.");
  return { ok: true };
}
