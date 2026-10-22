import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError } from "@/lib/drive-sync/http";
import { MesaMcpClient, getMesaMcpEndpoint } from "@/lib/lms/mcp-client";
import { unwrapToolResult } from "@/lib/lms/normalize";

export const maxDuration = 30;

// Read-only discovery for one assignment: the shape of get_assignment's reply (field paths and short values),
// so the import can follow the student's submitted files and links. Writes nothing.
function outline(value: unknown, path = "", out: Record<string, string> = {}, depth = 0): Record<string, string> {
  if (depth > 6 || Object.keys(out).length > 200) return out;
  if (Array.isArray(value)) { value.slice(0, 5).forEach((item, index) => outline(item, `${path}[${index}]`, out, depth + 1)); if (!value.length) out[path] = "[]"; return out; }
  if (value && typeof value === "object") { for (const [key, item] of Object.entries(value)) outline(item, path ? `${path}.${key}` : key, out, depth + 1); return out; }
  out[path] = typeof value === "string" ? value.slice(0, 160) : String(value);
  return out;
}

export async function GET(request: NextRequest) {
  try {
    await requireWorkspaceMember();
    const token = process.env.NEXUS_MCP_TOKEN;
    if (!token) return NextResponse.json({ error: "The LMS connector is not configured." }, { status: 503 });
    const mcp = new MesaMcpClient(getMesaMcpEndpoint(token));
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      const list = unwrapToolResult(await mcp.callTool("list_assignments", { status: "submitted" }));
      return NextResponse.json({ submitted: outline(list) });
    }
    if (!/^[\w-]{1,80}$/.test(id)) return NextResponse.json({ error: "Unknown assignment id." }, { status: 400 });
    return NextResponse.json({ detail: outline(unwrapToolResult(await mcp.callTool("get_assignment", { assignmentId: id }))) });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The LMS could not be read." }, { status: 502 });
  }
}
