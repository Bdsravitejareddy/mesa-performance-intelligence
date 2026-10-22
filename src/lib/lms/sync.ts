import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllowedEmails } from "@/lib/supabase/config";
import { MesaMcpClient, getMesaMcpEndpoint, type McpTool } from "./mcp-client";
import { matchingCourseId, suggestCourseForTitle, type CourseIdentity } from "./course-matching";
import { recordCompetencySnapshots } from "@/lib/competency/history";
import { mergeAssignmentRecords } from "./merge";
import { normalizeAssignmentRecords, unwrapToolResult, type MesaAssignmentRecord } from "./normalize";
import { attachedMaterialFiles, briefFromAssignment } from "./brief";
import { extractPdfPages, extractPptxSlides } from "@/lib/documents";
import { extractDocxPages, extractXlsxSheets } from "@/lib/office-documents";
import { toAssessmentRow, toSubmissionRow } from "./records";
import { assignmentDetailArguments, selectAssignmentReadTools, toolArgumentVariants } from "./tool-selection";

type SyncResult = { status: "succeeded" | "partial"; runId: string; courses: number; assessments: number; submissions: number; marks: number; feedback: number; message: string; competencySnapshots?: number | null; briefs?: number };

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

export async function persistRecords(client: SupabaseClient, defaultUserId: string, workspaceUserIds: string[], records: MesaAssignmentRecord[]) {
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
  // Assignments the LMS sends without a course are held, not dropped, and resolved from confirmed or unambiguous evidence.
  const { data: heldRows, error: heldError } = await client.from("lms_unassigned_assignments").select("source_record_id, resolved_course_id, resolution, resolved_by, resolved_at");
  if (heldError) throw new Error("Unassigned LMS records could not be loaded.");
  const held = new Map((heldRows ?? []).map((row) => [row.source_record_id as string, row]));
  const assessmentCourses = (existingCourses ?? []).filter((course) => course.lms_course_id).map((course) => ({ id: course.id as string, title: course.title as string }));
  let resolvedUnassigned = 0;
  const courseIds = new Map<string, string>();
  let createdOrLinkedCourses = 0;
  let assessmentCount = 0;
  let submissionCount = 0;
  let markCount = 0;
  let feedbackCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    let heldCourseId: string | null = null;
    if (!record.courseId && !record.courseTitle) {
      const sourceRecordId = `mesa-lms:assignment:${record.assignmentId}`;
      const previous = held.get(sourceRecordId);
      const suggestion = suggestCourseForTitle(record.title, assessmentCourses);
      const memberChoice = previous?.resolution === "member" && previous.resolved_course_id && courseByRowId.has(previous.resolved_course_id) ? previous.resolved_course_id : null;
      heldCourseId = memberChoice ?? suggestion?.courseId ?? null;
      const { error: holdError } = await client.from("lms_unassigned_assignments").upsert({
        user_id: defaultUserId,
        source_record_id: sourceRecordId,
        title: record.title,
        record,
        suggested_course_id: suggestion?.courseId ?? null,
        suggestion_basis: suggestion?.basis ?? "",
        resolved_course_id: heldCourseId,
        resolution: memberChoice ? "member" : heldCourseId ? "auto_title" : null,
        resolved_by: memberChoice ? previous?.resolved_by ?? null : null,
        resolved_at: heldCourseId ? previous?.resolved_at ?? new Date().toISOString() : null,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "source_record_id" });
      if (holdError) throw new Error("Unassigned LMS record could not be saved.");
      if (!heldCourseId) { skippedCount += 1; continue; }
      resolvedUnassigned += 1;
    }
    const key = heldCourseId ?? (record.courseId || courseKey(record.courseTitle) || "unknown");
    let courseRowId = heldCourseId ?? courseIds.get(key) ?? (record.courseId ? byLmsId.get(record.courseId) : undefined);
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
  return { courses: createdOrLinkedCourses, assessments: assessmentCount, submissions: submissionCount, marks: markCount, feedback: feedbackCount, skipped: skippedCount, resolvedUnassigned };
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
          completedReads += 1;
        } catch {
          failedReads += 1;
        }
      }
    }
    if (!completedReads) throw new Error("All supported Nexus assignment and grade reads failed.");
    let records = mergeAssignmentRecords(resultGroups);
    const assignmentDetailTool = availableTools.find((tool) => tool.name.toLowerCase().replace(/[^a-z]/g, "") === "getassignment");
    if (assignmentDetailTool) {
      const missingCourseRecords = records.filter((record) => !record.courseId && !record.courseTitle);
      const details = await Promise.all(missingCourseRecords.map(async (record) => {
        const args = assignmentDetailArguments(assignmentDetailTool, record.assignmentId);
        if (!args) return [];
        try {
          const result = unwrapToolResult(await mcp.callTool(assignmentDetailTool.name, args));
          const normalized = normalizeAssignmentRecords(result);
          completedReads += 1;
          return normalized;
        } catch {
          failedReads += 1;
          return [];
        }
      }));
      resultGroups.push(...details);
      records = mergeAssignmentRecords(resultGroups);
    }
    if (!records.length) {
      const summary: SyncResult = { status: "partial", runId: run.id, courses: 0, assessments: 0, submissions: 0, marks: 0, feedback: 0, message: failedReads ? `No structured assignment records were returned; ${failedReads} read operation(s) also failed. No records were changed.` : "The read-only MCP connection worked, but its assignment/grade tools returned no structured assignment records. No records were changed." };
      await client.from("sync_runs").update({ status: summary.status, finished_at: new Date().toISOString(), message: summary.message }).eq("id", run.id).eq("user_id", ownerId);
      return summary;
    }
    const counts = await persistRecords(client, ownerId, members, records);
    const hasPartialData = failedReads || counts.skipped || !counts.assessments || !counts.marks;
    const summary: SyncResult = { status: hasPartialData ? "partial" : "succeeded", runId: run.id, courses: counts.courses, assessments: counts.assessments, submissions: counts.submissions, marks: counts.marks, feedback: counts.feedback, message: hasPartialData ? `Imported ${counts.assessments} assessment(s), ${counts.marks} marks, and ${counts.feedback} feedback records. ${counts.resolvedUnassigned ? `${counts.resolvedUnassigned} course-less record(s) were filed by title or member confirmation; ` : ""}${counts.skipped} record(s) without a course are held for review; ${failedReads} read operation(s) failed.` : `Synced ${counts.assessments} assessments, ${counts.marks} marks, and ${counts.feedback} feedback records. Scores are converted to the 0–100 scale, and original LMS marks are retained.` };
    const { error } = await client.from("sync_runs").update({ status: summary.status, finished_at: new Date().toISOString(), message: summary.message }).eq("id", run.id).eq("user_id", ownerId);
    if (error) throw new Error("Sync status could not be saved.");
    // Briefs for assessments that have none yet (or are a week old), so grading can use the task's own requirements.
    if (assignmentDetailTool) {
      try { summary.briefs = await refreshBriefs(client, mcp, assignmentDetailTool); } catch { summary.briefs = 0; }
    }
    // New or regraded marks can change competency conclusions; append history after the sync is recorded.
    try { summary.competencySnapshots = await recordCompetencySnapshots(client, ownerId); } catch { summary.competencySnapshots = null; }
    return summary;
  } catch (error) {
    await client.from("sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), message: "LMS sync failed. Check connector configuration and try again." }).eq("id", run.id).eq("user_id", ownerId);
    throw error instanceof Error ? error : new Error("LMS sync failed.");
  }
}

async function refreshBriefs(client: SupabaseClient, mcp: MesaMcpClient, tool: McpTool): Promise<number> {
  // Briefs fetched before attachments were read (2026-10-23T12:00Z) are refreshed once; others weekly.
  const stale = new Date(Math.max(Date.now() - 7 * 86_400_000, Date.parse("2026-10-23T12:00:00Z"))).toISOString();
  const { data: rows } = await client.from("assessments").select("id, source_record_id, brief_fetched_at").like("source_record_id", "mesa-lms:assignment:%").or(`brief_fetched_at.is.null,brief_fetched_at.lt.${stale}`).limit(60);
  let saved = 0;
  const list = rows ?? [];
  // Six at a time keeps a manual sync inside its time limit.
  for (let start = 0; start < list.length; start += 6) {
    await Promise.all(list.slice(start, start + 6).map(async (row) => {
      const assignmentId = String(row.source_record_id).replace("mesa-lms:assignment:", "");
      const args = assignmentDetailArguments(tool, assignmentId);
      if (!args) return;
      try {
        const reply = unwrapToolResult(await mcp.callTool(tool.name, args));
        // The question paper and exhibits usually carry the actual task, so their text joins the brief.
        const attached = await readAttachedMaterials(attachedMaterialFiles(reply, assignmentId));
        const brief = [briefFromAssignment(reply), ...attached].join("\n\n").slice(0, 20_000);
        const { error } = await client.from("assessments").update({ brief, brief_fetched_at: new Date().toISOString() }).eq("id", row.id);
        if (!error && brief) saved += 1;
      } catch { /* a brief that cannot be read is retried on the next sync */ }
    }));
  }
  return saved;
}

async function readAttachedMaterials(files: { name: string; url: string }[]): Promise<string[]> {
  const texts: string[] = [];
  for (const file of files) {
    try {
      const response = await fetch(file.url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 20 * 1024 * 1024) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const kind = new URL(file.url).pathname.split(".").pop()?.toLowerCase();
      const pages = kind === "pdf" ? await extractPdfPages(bytes.slice(), { maxPages: 40 })
        : kind === "docx" ? await extractDocxPages(bytes)
        : kind === "xlsx" ? await extractXlsxSheets(bytes)
        : (await extractPptxSlides(bytes)).map((slide) => ({ pageNumber: slide.slideNumber, text: slide.text }));
      const text = pages.map((page) => page.text).join("\n").replace(/\u0000/g, "").trim();
      if (text) texts.push(`Attached ${file.name}:\n${text.slice(0, 8000)}`);
    } catch { /* an unreadable attachment leaves the brief as the LMS text */ }
  }
  return texts;
}
