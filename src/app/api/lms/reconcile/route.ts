import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError } from "@/lib/drive-sync/http";
import { createClient } from "@/lib/supabase/server";
import { MesaMcpClient, getMesaMcpEndpoint } from "@/lib/lms/mcp-client";
import { selectAssignmentReadTools, toolArgumentVariants } from "@/lib/lms/tool-selection";
import { normalizeAssignmentRecords, unwrapToolResult, type MesaAssignmentRecord } from "@/lib/lms/normalize";
import { mergeAssignmentRecords } from "@/lib/lms/merge";

export const maxDuration = 60;

// Read-only reconciliation: what the LMS lists versus what the workspace holds. Uses only the same
// read tools as the nightly sync and writes nothing.
export async function GET() {
  try {
    await requireWorkspaceMember();
    const token = process.env.NEXUS_MCP_TOKEN;
    if (!token) return NextResponse.json({ error: "The LMS connector is not configured." }, { status: 503 });
    const mcp = new MesaMcpClient(getMesaMcpEndpoint(token));
    const tools = selectAssignmentReadTools(await mcp.listTools());
    const groups: MesaAssignmentRecord[][] = [];
    for (const tool of tools) for (const args of toolArgumentVariants(tool) ?? []) {
      try { groups.push(normalizeAssignmentRecords(unwrapToolResult(await mcp.callTool(tool.name, args)))); } catch { /* counted below as missing data */ }
    }
    const records = mergeAssignmentRecords(groups);
    const supabase = await createClient();
    const [assessments, held] = await Promise.all([
      supabase.from("assessments").select("source_record_id"),
      supabase.from("lms_unassigned_assignments").select("source_record_id, resolved_course_id"),
    ]);
    const imported = new Set((assessments.data ?? []).map((row) => row.source_record_id as string));
    const heldIds = new Map((held.data ?? []).map((row) => [row.source_record_id as string, row.resolved_course_id as string | null]));
    const status: Record<string, number> = {};
    for (const record of records) status[record.status || "unknown"] = (status[record.status || "unknown"] ?? 0) + 1;
    const key = (record: MesaAssignmentRecord) => `mesa-lms:assignment:${record.assignmentId}`;
    const missing = records.filter((record) => !imported.has(key(record)) && !heldIds.has(key(record)));
    return NextResponse.json({
      lmsAssignments: records.length,
      byStatus: status,
      submittedInLms: records.filter((record) => record.submissionId || /submit/i.test(record.status)).length,
      withReleasedMark: records.filter((record) => record.score !== null).length,
      withFeedback: records.filter((record) => record.feedback).length,
      importedAsAssessments: records.filter((record) => imported.has(key(record))).length,
      heldWithoutCourse: records.filter((record) => heldIds.has(key(record)) && !imported.has(key(record))).length,
      missing: missing.map((record) => ({ title: record.title, course: record.courseTitle, status: record.status })),
    });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The LMS could not be read." }, { status: 502 });
  }
}
