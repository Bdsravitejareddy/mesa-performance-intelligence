import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { parsePortfolioUpload } from "@/lib/portfolio/summary";

// Stores the member's own collected GitHub and Vercel summary under their session (workspace RLS applies).
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => null);
  let rows;
  try { rows = parsePortfolioUpload(body); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid file." }, { status: 400 }); }
  if (!rows.length) return NextResponse.json({ error: "The file has no projects." }, { status: 400 });
  const { error } = await supabase.from("portfolio_items").upsert(rows.map((row) => ({ ...row, user_id: userId, collected_at: new Date().toISOString() })), { onConflict: "source,external_id" });
  if (error) return NextResponse.json({ error: "The portfolio could not be saved." }, { status: 500 });
  return NextResponse.json({ ok: true, github: rows.filter((row) => row.source === "github").length, vercel: rows.filter((row) => row.source === "vercel").length }, { status: 201 });
}
