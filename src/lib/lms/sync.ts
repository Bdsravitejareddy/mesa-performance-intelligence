import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllowedEmails } from "@/lib/supabase/config";
import { MesaMcpClient, getMesaMcpEndpoint } from "./mcp-client";
import { matchingCourseId, type CourseIdentity } from "./course-matching";
import { assignmentRecordFieldPaths, normalizeAssignmentRecords, unwrapToolResult, type MesaAssignmentRecord } from "./normalize";
import { toAssessmentRow, toSubmissionRow } from "./records";
import { selectAssignmentReadTools, toolArgumentVariants } from "./tool-selection";

type SyncResult = { status: "succeeded" | "partial"; runId: string; courses: number; assessments: number; submissions: number; marks: number; feedback: number; message: string };

function mergeRecords(groups: MesaAssignmentRecord[][]): MesaAssignmentRecord[] {
  const records = new Map<string, MesaAssignmentRecord>();
  for (const group of groups) for (const record of group) {
    const key = `${record.courseId || record.courseTitle.toLowerCase()}::${record.assignmentId}`;
    const current = records.get(key);
    records.set(key, current ? {
      ...current,
      ...record,
      submissionId: record.submissionId || current.submissionId,
      courseTitle: record.courseTitle || current.courseTitle,
      score: record.score ?? current.score,
      feedback: record.feedback || current.feedback,
      status: record.status || current.status,
    } : record);
  }
  return [...records.values()];
}

async function workspaceMembers(client: SupabaseClient): Promise<string[]> {
  const emails = new Set(getAllowedEmails());
  if (!emails.size) throw new Error("Workspace members are not configured.");
  const { data: invitedIds, error: membershipError } = await client.rpc("mesa_lms_sync_member_ids");
  if (membershipError || !Array.isArray(invitedIds)) throw new Error("Current workspace invitations could not be verified.");
  const invited = new Set(invitedIds.filter((id): id is string => typeof id === "string"));
  const verified: Array<{ id: string; email: string }> = [];
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Workspace owner could not be resolved.");
    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && emails.has(email) && invited.has(user.id) && user.email_confirmed_at) verified.push({ id: user.id, email });
    }
    if (data.users.length < 1000) break;
  }
  verified.sort((a, b) => a.email.localeCompare(b.email) || a.id.localeCompare(b.id));
  if (!verified.length) throw new Error("No currently invited and verified dashboard member is available for LMS import.");
  return verified.map((user) => user.id);
}

function courseKey(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function persistRecords(client: SupabaseClient, defaultUserId: string, workspaceUserIds: string[], records: MesaAssignmentRecord[]) {
  const { data: existingCourses, error: courseError } = await client.from("courses").select("id,user_id,title,lms_course_id").in("user_id", workspaceUserIds);
  if (courseError) throw new Error("Course lookup failed.");
  const byLmsId = new Map<string, string>();
  const byTitle = new Map<string, string[]>();
  const courseByRowId = new Map<string, CourseIdentity>();
  for (const course of existingCourses ?? []) {
    courseByRowId.set(course.id, { userId: course.user_id, title: course.title, lmsCourseId: course.lms_course_id });
    if (course.lms_course_id) byLmsId.set(course.lms_course_id, course.id);
    const key = courseKey(course.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), course.id]);
  }
  const courseIds = new Map<string, string>();
  let createdOrLinkedCourses = 0;
  let assessmentCount = 0;
  let submissionCount = 0;
  let markCount = 0;
  let feedbackCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    if (!record.courseId && !record.courseTitle) { skippedCount += 1; continue; }
    const key = record.courseId || courseKey(record.courseTitle) || "unknown";
    let courseRowId = courseIds.get(key) ?? (record.courseId ? byLmsId.get(record.courseId) : undefined);
    if (!courseRowId && record.courseTitle) {
      const matches = byTitle.get(courseKey(record.courseTitle)) ?? [];
      if (record.courseId) courseRowId = matchingCourseId(matches, courseByRowId, record.courseId);
      else if (matches.length === 1) courseRowId = matches[0];
    }
    if (!courseRowId) {
      const title = record.courseTitle || `Mesa course ${record.courseId}`;
      const payload = { user_id: defaultUserId, title, code: record.courseId ? `MESA-${record.courseId.slice(0, 12)}` : "" , ...(record.courseId ? { lms_course_id: record.courseId } : {}) };
      const { data, error } = record.courseId
        ? await client.from("courses").upsert(payload, { onConflict: "user_id,lms_course_id" }).select("id").single()
        : await client.from("courses").insert(payload).select("id").single();
      if (error || !data || typeof data.id !== "string") throw new Error("Course could not be saved.");
      courseRowId = data.id;
      createdOrLinkedCourses += 1;
      byTitle.set(courseKey(title), [...(byTitle.get(courseKey(title)) ?? []), courseRowId]);
      courseByRowId.set(courseRowId, { userId: defaultUserId, title, lmsCourseId: record.courseId || null });
      if (record.courseId) byLmsId.set(record.courseId, courseRowId);
    } else if (record.courseId && !byLmsId.has(record.courseId)) {
      const courseOwnerId = courseByRowId.get(courseRowId)?.userId;
      const { data: linkedCourse, error } = await client.from("courses").update({ lms_course_id: record.courseId }).eq("id", courseRowId).eq("user_id", courseOwnerId).is("lms_course_id", null).select("id").maybeSingle();
      if (error || !linkedCourse) throw new Error("Course source could not be linked safely. Retry the LMS sync.");
      byLmsId.set(record.courseId, courseRowId);
      courseByRowId.set(courseRowId, { ...courseByRowId.get(courseRowId)!, lmsCourseId: record.courseId });
      createdOrLinkedCourses += 1;
    }
    if (!courseRowId) throw new Error("Course could not be resolved.");
    courseIds.set(key, courseRowId);

    const courseOwnerId = courseByRowId.get(courseRowId)?.userId;
    if (!courseOwnerId) throw new Error("Course owner could not be resolved.");
    const assessmentRow = toAssessmentRow(record, courseOwnerId, courseRowId);
    const { data: assessment, error: assessmentError } = await client.from("assessments").upsert(assessmentRow, { onConflict: "user_id,source_record_id" }).select("id").single();
    if (assessmentError || !assessment) throw new Error("Assessment could not be saved.");
    assessmentCount += 1;
    if (!record.submissionId && record.score === null && !record.feedback && !record.status) continue;
    const submissionRow = toSubmissionRow(record, courseOwnerId, assessment.id);
    const { error: submissionError } = await client.from("submissions").upsert(submissionRow, { onConflict: "user_id,source_record_id" });
    if (submissionError) throw new Error("Submission evidence could not be saved.");
    submissionCount += 1;
    if (record.score !== null) markCount += 1;
    if (record.feedback) feedbackCount += 1;
  }
  return { courses: createdOrLinkedCourses, assessments: assessmentCount, submissions: submissionCount, marks: markCount, feedback: feedbackCount, skipped: skippedCount };
}

export async function syncMesaLms(): Promise<SyncResult> {
  const token = process.env.NEXUS_MCP_TOKEN;
  if (!token) throw new Error("Nexus MCP token is not configured in the server environment.");
  const client = createAdminClient();
  const members = await workspaceMembers(client);
  const ownerId = members[0];
  const { data: run, error: runError } = await client.from("sync_runs").insert({ user_id: ownerId, source_name: "Mesa Nexus MCP", status: "running", message: "Read-only assignment and grade sync started." }).select("id").single();
  if (runError || !run) throw new Error("LMS sync could not be started.");

  try {
    const mcp = new MesaMcpClient(getMesaMcpEndpoint(token));
    const availableTools = await mcp.listTools();
    const tools = selectAssignmentReadTools(availableTools);
    if (!tools.length) throw new Error("No read-only assignment or grade list tools are available.");
    const resultGroups: MesaAssignmentRecord[][] = [];
    const readDiagnostics: Array<{ tool: string; records: number; missingCourse: number; fields: string[] }> = [];
    let failedReads = 0;
    let completedReads = 0;
    for (const tool of tools) {
      const variants = toolArgumentVariants(tool);
      if (!variants) continue;
      for (const args of variants) {
        try {
          const result = unwrapToolResult(await mcp.callTool(tool.name, args));
          const normalized = normalizeAssignmentRecords(result);
          resultGroups.push(normalized);
          readDiagnostics.push({
            tool: tool.name,
            records: normalized.length,
            missingCourse: normalized.filter((record) => !record.courseId && !record.courseTitle).length,
            fields: assignmentRecordFieldPaths(result),
          });
          completedReads += 1;
        } catch {
          failedReads += 1;
        }
      }
    }
    if (!completedReads) throw new Error("All supported Nexus assignment and grade reads failed.");
    const records = mergeRecords(resultGroups);
    if (!records.length) {
      const summary: SyncResult = { status: "partial", runId: run.id, courses: 0, assessments: 0, submissions: 0, marks: 0, feedback: 0, message: failedReads ? `No structured assignment records were returned; ${failedReads} read operation(s) also failed. No records were changed.` : "The read-only MCP connection worked, but its assignment/grade tools returned no structured assignment records. No records were changed." };
      await client.from("sync_runs").update({ status: summary.status, finished_at: new Date().toISOString(), message: summary.message }).eq("id", run.id).eq("user_id", ownerId);
      return summary;
    }
    const counts = await persistRecords(client, ownerId, members, records);
    const missingCourseDiagnostics = readDiagnostics.filter((item) => item.missingCourse > 0).slice(0, 3)
      .map((item) => `${item.tool}: ${item.missingCourse}/${item.records} missing course; fields=${item.fields.join(",") || "none"}`);
    const toolInventory = availableTools.map((tool) => {
      const properties = tool.inputSchema?.properties && typeof tool.inputSchema.properties === "object" ? Object.keys(tool.inputSchema.properties) : [];
      const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required.map(String) : [];
      return `${tool.name}(args:${properties.join(",") || "none"};required:${required.join(",") || "none"})`;
    }).join(" | ").slice(0, 1200);
    const hasPartialData = failedReads || counts.skipped || !counts.assessments || !counts.marks;
    const summary: SyncResult = { status: hasPartialData ? "partial" : "succeeded", runId: run.id, courses: counts.courses, assessments: counts.assessments, submissions: counts.submissions, marks: counts.marks, feedback: counts.feedback, message: hasPartialData ? `Imported ${counts.assessments} assessment(s), ${counts.marks} marks, and ${counts.feedback} feedback records; ${failedReads} read operation(s) failed and ${counts.skipped} record(s) lacked a course reference.${missingCourseDiagnostics.length ? ` Tool field diagnostics: ${missingCourseDiagnostics.join(" | ")}` : ""} Available tool schemas: ${toolInventory}` : `Synced ${counts.assessments} assessments, ${counts.marks} marks, and ${counts.feedback} feedback records. Only explicit earned scores were saved as official marks.` };
    const { error } = await client.from("sync_runs").update({ status: summary.status, finished_at: new Date().toISOString(), message: summary.message }).eq("id", run.id).eq("user_id", ownerId);
    if (error) throw new Error("Sync status could not be saved.");
    return summary;
  } catch (error) {
    await client.from("sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), message: "LMS sync failed. Check connector configuration and try again." }).eq("id", run.id).eq("user_id", ownerId);
    throw error instanceof Error ? error : new Error("LMS sync failed.");
  }
}
