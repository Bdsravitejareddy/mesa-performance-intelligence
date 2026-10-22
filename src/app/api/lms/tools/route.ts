import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError } from "@/lib/drive-sync/http";
import { MesaMcpClient, getMesaMcpEndpoint } from "@/lib/lms/mcp-client";

export const maxDuration = 30;

// Discovery only: lists the LMS connector's tool names, descriptions and argument names so members can see
// what the read-only integration could use (for example a submission-file tool). No tool is called, and the
// token stays server-side.
export async function GET() {
  try {
    await requireWorkspaceMember();
    const token = process.env.NEXUS_MCP_TOKEN;
    if (!token) return NextResponse.json({ error: "The LMS connector is not configured." }, { status: 503 });
    const tools = await new MesaMcpClient(getMesaMcpEndpoint(token)).listTools();
    return NextResponse.json({ tools: tools.map((tool) => {
      const schema = tool.inputSchema ?? {};
      const properties = schema.properties && typeof schema.properties === "object" ? Object.keys(schema.properties as Record<string, unknown>) : [];
      return { name: tool.name, description: (tool.description ?? "").slice(0, 400), arguments: properties, required: Array.isArray(schema.required) ? schema.required : [] };
    }) });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The LMS tool list could not be read." }, { status: 502 });
  }
}
