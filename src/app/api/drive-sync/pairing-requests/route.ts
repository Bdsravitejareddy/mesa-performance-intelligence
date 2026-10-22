import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { approvePairing, pendingPairings } from "@/lib/drive-sync/device-pairing";
import { HttpError, jsonError, jsonResponse, readJsonBody } from "@/lib/drive-sync/http";
import { accessibleConnection, requireConfigured } from "../connections/management";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  try { await requireWorkspaceMember(); requireConfigured(); return jsonResponse({ requests: await pendingPairings() }); }
  catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireWorkspaceMember();
    requireConfigured();
    const body = await readJsonBody(request);
    if (typeof body.requestId !== "string" || !UUID.test(body.requestId) || typeof body.connectionId !== "string" || !UUID.test(body.connectionId)) throw new HttpError(400, "Choose a pairing request and a connection.");
    const connection = await accessibleConnection(body.connectionId);
    if (!connection.enabled) throw new HttpError(409, "Enable the connection before pairing.");
    return jsonResponse(await approvePairing(body.requestId, body.connectionId, userId));
  } catch (error) { return jsonError(error); }
}
