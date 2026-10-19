import { issuePairing, requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/drive-sync/http";
import { DriveSyncStore } from "@/lib/drive-sync/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConfigured, label, listConnections, mappings, onlyKeys, requireConfigured, safeConnection } from "./management";

export async function GET() {
  try {
    await requireWorkspaceMember();
    const configured = isConfigured();
    return jsonResponse({ connections: configured ? await listConnections() : [], configured });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireWorkspaceMember();
    requireConfigured();
    const body = await readJsonBody(request);
    onlyKeys(body, ["label", "mappings"]);
    const title = label(body.label);
    const folders = await mappings(body.mappings);
    const connection = await new DriveSyncStore(createAdminClient()).configure(userId, null, folders, title, true);
    return jsonResponse({ connection: safeConnection(connection), ...await issuePairing(connection.id) }, 201);
  } catch (error) { return jsonError(error); }
}
