import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError, jsonError, jsonResponse, readJsonBody } from "@/lib/drive-sync/http";
import { DriveSyncStore } from "@/lib/drive-sync/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessibleConnection, label, mappings, onlyKeys, requireConfigured, safeConnection } from "../management";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireWorkspaceMember();
    requireConfigured();
    const { id } = await context.params;
    const current = await accessibleConnection(id);
    const body = await readJsonBody(request);
    onlyKeys(body, ["label", "enabled", "mappings"]);
    if (!Object.keys(body).length || (body.enabled !== undefined && typeof body.enabled !== "boolean")) throw new HttpError(400, "Provide a valid connection update.");
    const title = body.label === undefined ? current.label : label(body.label);
    const folders = body.mappings === undefined ? current.mappings.map(({ driveFolderId, mode, courseId, rootCourseTitle }) => ({ driveFolderId, mode, courseId, rootCourseTitle })) : await mappings(body.mappings);
    const enabled = body.enabled === undefined ? current.enabled : body.enabled as boolean;
    const connection = await new DriveSyncStore(createAdminClient()).configure(userId, id, folders, title, enabled, current.mappingRevision);
    return jsonResponse({ connection: safeConnection(connection) });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "40001") {
      return jsonError(new HttpError(409, "Drive connection changed. Reload it and try again."));
    }
    return jsonError(error);
  }
}
