import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Privileged client: create only after route authorization; never share a user session. */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    throw new Error("Drive sync server configuration is unavailable.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
