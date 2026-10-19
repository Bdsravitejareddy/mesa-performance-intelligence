import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedEmail, isDemoMode } from "@/lib/supabase/config";
import { DriveSyncStore } from "./store";
import { HttpError } from "./http";

export function hashConnectorSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function requireWorkspaceMember(): Promise<{ userId: string }> {
  if (isDemoMode()) throw new HttpError(503, "Live Drive sync is unavailable in demo mode.");
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  const user = data?.user;
  if (error || !user) throw new HttpError(401, "Sign in required.");
  if (!user.email_confirmed_at || !user.email || !isAllowedEmail(user.email)) {
    throw new HttpError(403, "Workspace membership required.");
  }
  // Unlike the proxy's fast claims check, this rechecks the database invitation.
  const membership = await client.rpc("drive_sync_workspace_member");
  if (membership.error || membership.data !== true) throw new HttpError(403, "Workspace membership required.");
  return { userId: user.id };
}

export async function requireConnector(request: Request): Promise<{ connectionId: string; userId: string }> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new HttpError(401, "Valid connector credentials required.");
  const identity = await new DriveSyncStore(createAdminClient()).authenticate(hashConnectorSecret(match[1]));
  if (!identity) throw new HttpError(401, "Valid connector credentials required.");
  return identity;
}

export async function issuePairing(connectionId: string): Promise<{ pairingCode: string; expiresAt: string }> {
  const pairingCode = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await new DriveSyncStore(createAdminClient()).issuePairing(connectionId, hashConnectorSecret(pairingCode), expiresAt);
  return { pairingCode, expiresAt };
}

export async function consumePairing(code: string): Promise<{ token: string; connectionId: string }> {
  const store = new DriveSyncStore(createAdminClient());
  // Trust the platform-owned address only inside its runtime, never generic proxy headers.
  // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
  const address = process.env.VERCEL === "1" ? (await headers()).get("x-vercel-forwarded-for")?.trim() : undefined;
  const family = address ? isIP(address) : 0;
  if (!address || !family) throw new HttpError(503, "Pairing requires a trusted client address.");
  const canonicalAddress = family === 6 ? new URL(`http://[${address}]/`).hostname.slice(1, -1) : address;
  if (!await store.checkPairingBudget(
    hashConnectorSecret(`drive-agent-pair-caller:${canonicalAddress}`),
    hashConnectorSecret(`drive-agent-pair-code:${code}`),
  )) {
    throw new HttpError(429, "Too many pairing attempts. Try again in 15 minutes.");
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new HttpError(401, "Invalid or expired pairing code.");
  const token = randomBytes(32).toString("base64url");
  try {
    const identity = await store.consumePairing(hashConnectorSecret(code), hashConnectorSecret(token));
    return { token, connectionId: identity.connectionId };
  } catch {
    throw new HttpError(401, "Invalid or expired pairing code.");
  }
}
