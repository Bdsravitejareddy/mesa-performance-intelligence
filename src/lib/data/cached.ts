import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Per-user cache of read models, keyed by the workspace data version. The version changes on every data
// write (database triggers), so a cached result is reused only while the underlying data is unchanged.
// Queries inside the cache run with the user's own access token, so row-level security still applies.

type Session = { userId: string; accessToken: string; version: string };

// One session lookup and one version query per request, shared by every cached read on the page.
export const workspaceSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  if (typeof supabase.auth?.getSession !== "function") return null;
  const [{ data: claims }, { data: session }] = await Promise.all([supabase.auth.getClaims(), supabase.auth.getSession()]);
  const userId = claims?.claims?.sub;
  const accessToken = session?.session?.access_token;
  if (typeof userId !== "string" || !accessToken) return null;
  const { data } = await supabase.from("workspace_data_version").select("version").eq("id", 1).maybeSingle();
  // Without a readable version, fall back to a per-minute key so results are never older than a minute.
  return { userId, accessToken, version: data?.version ? String(data.version) : `t${Math.floor(Date.now() / 60000)}` };
});

function tokenClient(accessToken: string): SupabaseClient {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Runs `load` with an RLS-scoped client and caches the (JSON-serialisable) result for this user and data version.
export async function cachedRead<T>(name: string, load: (client: SupabaseClient) => Promise<T>): Promise<T> {
  const session = await workspaceSession();
  if (!session) return load(await createClient());
  // The arguments (user, data version) form the cache key; the loader itself only needs the client.
  const run = unstable_cache(async (...key: string[]) => { void key; return load(tokenClient(session.accessToken)); }, ["mesa-read", name], { revalidate: 86_400, tags: [`user:${session.userId}`] });
  return run(session.userId, session.version);
}
