import { pairingStatus } from "@/lib/drive-sync/device-pairing";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/drive-sync/http";

export async function POST(request: Request) {
  try { return jsonResponse(await pairingStatus((await readJsonBody(request)).codeHash)); }
  catch (error) { return jsonError(error); }
}
