import { consumePairing } from "@/lib/drive-sync/auth";
import { HttpError, jsonError, jsonResponse, readJsonBody } from "@/lib/drive-sync/http";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (Object.keys(body).some((key) => key !== "code") || typeof body.code !== "string") {
      throw new HttpError(400, "A pairing code is required.");
    }
    return jsonResponse(await consumePairing(body.code));
  } catch (error) { return jsonError(error); }
}
