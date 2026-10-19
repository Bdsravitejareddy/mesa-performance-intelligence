import { issuePairing, requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError, jsonError, jsonResponse, readJsonBody } from "@/lib/drive-sync/http";
import { accessibleConnection, onlyKeys, requireConfigured } from "../../management";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireWorkspaceMember();
    requireConfigured();
    const { id } = await context.params;
    const connection = await accessibleConnection(id);
    if (!connection.enabled) throw new HttpError(409, "Enable the connection before pairing.");
    onlyKeys(await readJsonBody(request), []);
    return jsonResponse(await issuePairing(id));
  } catch (error) { return jsonError(error); }
}
