import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { nexusCourseId, outlineDocument, outlineSheetId, sheetTabUrl, sheetTabs, sheetText, sheetViewUrl, type OutlinePage } from "@/lib/imports/nexus-outline";

export const maxDuration = 60;
const OUTLINE_PREFIX = "Nexus course outline — ";

async function fetchText(url: string): Promise<string | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow", cache: "no-store" }).catch(() => null);
  return response?.ok && (response.headers.get("content-type") ?? "").includes("text/html") ? response.text() : null;
}

// Stores the outline a Nexus course's "Outlines" tab links to, read with the member's standing read-only approval
// (see AGENTS.md). The member's browser reads the Nexus page and passes its course page and outline link; only the
// linked Google Sheet's read-only view is fetched here. Saved as a versioned syllabus material, labelled with
// its Nexus page and read date; an unchanged outline is not saved again.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => null) as { courseTitle?: unknown; nexusUrl?: unknown; outlineUrl?: unknown } | null;
  const nexusUrl = String(body?.nexusUrl ?? "").trim(), outlineUrl = String(body?.outlineUrl ?? "").trim(), courseTitle = String(body?.courseTitle ?? "").replace(/\s+/g, " ").trim();
  const nexusId = nexusCourseId(nexusUrl), sheetId = outlineSheetId(outlineUrl);
  if (!nexusId || !courseTitle) return NextResponse.json({ error: "Give the Nexus course page and its title." }, { status: 400 });
  if (!sheetId) return NextResponse.json({ error: "The outline must be a Google Sheets link." }, { status: 400 });

  const { data: courses } = await supabase.from("courses").select("id, user_id, title");
  const course = (courses ?? []).find((row) => String(row.title).trim().toLowerCase() === courseTitle.toLowerCase());
  if (!course) return NextResponse.json({ error: "No course with this title in the workspace.", status: "no_course" }, { status: 404 });

  const view = await fetchText(sheetViewUrl(sheetId));
  const tabs = view ? sheetTabs(view) : [];
  if (!tabs.length) return NextResponse.json({ error: "The outline sheet could not be read (it may not be shared for viewing)." }, { status: 422 });
  const pages: OutlinePage[] = [];
  for (const tab of tabs) {
    const html = await fetchText(sheetTabUrl(sheetId, tab.gid));
    const text = html ? sheetText(html) : "";
    if (text) pages.push({ pageNumber: pages.length + 1, tab: tab.name, text });
  }
  if (!pages.length) return NextResponse.json({ error: "The outline sheet has no readable text." }, { status: 422 });

  // Versioned like any material: the same text read again is not a new version.
  const name = `${OUTLINE_PREFIX}${course.title}.txt`.slice(0, 240);
  const digest = createHash("sha256").update(JSON.stringify(pages.map(({ tab, text }) => [tab, text]))).digest("hex");
  const { data: previous } = await supabase.from("course_materials").select("id, version, storage_path").eq("course_id", course.id).eq("name", name).order("version", { ascending: false }).limit(1).maybeSingle();
  if (previous && String(previous.storage_path).includes(digest.slice(0, 16))) return NextResponse.json({ status: "unchanged", course: course.title, version: previous.version, pages: pages.length });
  const version = (previous?.version as number | undefined ?? 0) + 1;
  const readOn = new Date().toISOString().slice(0, 10);
  const document = outlineDocument({ course: course.title as string, nexusUrl, sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`, readOn }, pages);
  const bytes = new TextEncoder().encode(document);
  const storagePath = `${userId}/${course.id}/nexus-outlines/v${version}-${digest.slice(0, 16)}.txt`;
  const { error: uploadError } = await supabase.storage.from("course-files").upload(storagePath, bytes, { contentType: "text/plain", upsert: false });
  if (uploadError) return NextResponse.json({ error: "The outline could not be stored." }, { status: 500 });

  const { data: material, error: materialError } = await supabase.from("course_materials").insert({
    user_id: course.user_id, course_id: course.id, name, storage_path: storagePath, mime_type: "text/plain", file_size: bytes.byteLength,
    version, source_kind: "syllabus", extraction_status: "complete",
  }).select("id").single();
  if (materialError || !material) return NextResponse.json({ error: "The outline was read, but could not be saved." }, { status: 500 });
  // Each page names its source, so a cited excerpt carries its provenance.
  const { error: pagesError } = await supabase.from("material_pages").insert(pages.map((page) => ({
    user_id: course.user_id, material_id: material.id, page_number: page.pageNumber,
    extracted_text: `Course outline (Nexus Outlines tab, read ${readOn}) — ${page.tab}\n${page.text}`,
  })));
  if (pagesError) {
    await supabase.from("course_materials").delete().eq("id", material.id);
    return NextResponse.json({ error: "The outline was read, but its pages could not be saved." }, { status: 500 });
  }
  return NextResponse.json({ status: previous ? "updated" : "stored", course: course.title, version, pages: pages.length, materialId: material.id }, { status: 201 });
}
