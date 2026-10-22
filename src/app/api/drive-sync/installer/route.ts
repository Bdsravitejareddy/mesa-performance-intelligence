import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { deviceInstaller } from "@/lib/drive-sync/installation";
import { jsonError, jsonResponse } from "@/lib/drive-sync/http";
import { requireConfigured } from "../connections/management";

// The Apps Script files for device pairing. They contain no pairing code or other secret.
export async function GET() {
  try { await requireWorkspaceMember(); requireConfigured(); return jsonResponse(await deviceInstaller()); }
  catch (error) { return jsonError(error); }
}
