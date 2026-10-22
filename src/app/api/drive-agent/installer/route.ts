import { deviceInstaller } from "@/lib/drive-sync/installation";

// The secret-free installer (device pairing). It holds only the public app and storage origins, so it can be
// fetched without signing in, including from the Apps Script editor; pairing still needs a member's approval.
export async function GET() {
  try {
    const { code, manifest } = await deviceInstaller();
    return Response.json({ code, manifest }, { headers: { "Access-Control-Allow-Origin": "https://script.google.com", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Installer unavailable." }, { status: 503 });
  }
}
