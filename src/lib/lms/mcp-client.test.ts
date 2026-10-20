import { describe, expect, it, vi } from "vitest";
import { MesaMcpClient } from "./mcp-client";

describe("Mesa MCP HTTP client", () => {
  it("initializes once, keeps the server session, and calls a listed read tool", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "Nexus" } } }), { headers: { "content-type": "application/json", "mcp-session-id": "session-fixture" } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "list_assignments", inputSchema: { type: "object", properties: {} } }] } }), { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 3, result: { structuredContent: { assignments: [] } } }), { headers: { "content-type": "application/json" } }));
    const client = new MesaMcpClient("https://students.mesaschool.co.in/mcp/token-fixture", fetcher);
    const tools = await client.listTools();
    expect(tools[0]?.name).toBe("list_assignments");
    expect(await client.callTool("list_assignments", {})).toEqual({ structuredContent: { assignments: [] } });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).get("mcp-session-id")).toBe("session-fixture");
  });

  it("parses the JSON message in an SSE response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "Nexus" } } })}\n\n`, { headers: { "content-type": "text/event-stream" } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [] } })}\n\n`, { headers: { "content-type": "text/event-stream" } }));
    expect(await new MesaMcpClient("https://students.mesaschool.co.in/mcp/token", fetcher).listTools()).toEqual([]);
  });

  it("skips SSE notifications and waits for the matching JSON-RPC response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "Nexus" } } }), { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response([
        { jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } },
        { jsonrpc: "2.0", id: 2, result: { tools: [{ name: "list_assignments" }] } },
      ].map((message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } }));
    expect((await new MesaMcpClient("https://students.mesaschool.co.in/mcp/token", fetcher).listTools())[0]?.name).toBe("list_assignments");
  });
});
