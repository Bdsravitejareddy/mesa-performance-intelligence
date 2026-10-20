type JsonObject = Record<string, unknown>;
export type McpTool = { name: string; description?: string; inputSchema?: JsonObject };
type RpcMessage = { jsonrpc?: string; id?: number; result?: unknown; error?: { code?: number; message?: string } };

function parsePayload(text: string, contentType: string): RpcMessage[] {
  if (!text.trim()) return [];
  if (!contentType.includes("text/event-stream")) {
    try { return [JSON.parse(text) as RpcMessage]; } catch { throw new Error("Mesa MCP returned an invalid protocol response."); }
  }
  const messages: RpcMessage[] = [];
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data || data === "[DONE]") continue;
    try { messages.push(JSON.parse(data) as RpcMessage); } catch { /* Ignore non-JSON keepalive events. */ }
  }
  return messages;
}

export class MesaMcpClient {
  private sessionId: string | null = null;
  private protocolVersion = "2025-03-26";
  private nextId = 1;
  private initialized: Promise<void> | null = null;

  constructor(private readonly endpoint: string, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.hostname !== "students.mesaschool.co.in") throw new Error("Mesa MCP endpoint must use the official HTTPS host.");
  }

  async listTools(): Promise<McpTool[]> {
    await this.ensureInitialized();
    const result = await this.rpc("tools/list", {});
    const tools = (result as JsonObject | null)?.tools;
    return Array.isArray(tools) ? tools.filter((tool): tool is McpTool => !!tool && typeof tool === "object" && typeof (tool as McpTool).name === "string") : [];
  }

  async callTool(name: string, args: JsonObject): Promise<unknown> {
    await this.ensureInitialized();
    const message = await this.rpc("tools/call", { name, arguments: args });
    const object = message as JsonObject | null;
    if (object && object.isError === true) throw new Error("Mesa MCP read operation returned an error.");
    return message;
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initialized) this.initialized = this.initialize();
    return this.initialized;
  }

  private async initialize(): Promise<void> {
    const message = await this.send("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: { name: "mesa-performance-intelligence", version: "1.0.0" },
    }, true);
    const result = message.result as JsonObject | undefined;
    if (!result || typeof result.protocolVersion !== "string") throw new Error("Mesa MCP did not complete its protocol handshake.");
    this.protocolVersion = result.protocolVersion;
    await this.sendNotification("notifications/initialized");
  }

  private async rpc(method: string, params: JsonObject): Promise<unknown> {
    const message = await this.send(method, params, true);
    if (message.error) throw new Error(`Mesa MCP operation failed (${message.error.code ?? "protocol error"}).`);
    return message.result;
  }

  private async send(method: string, params: JsonObject, expectsResponse: boolean): Promise<RpcMessage> {
    const id = this.nextId++;
    const headers = new Headers({ accept: "application/json, text/event-stream", "content-type": "application/json" });
    if (this.sessionId) {
      headers.set("mcp-session-id", this.sessionId);
      headers.set("mcp-protocol-version", this.protocolVersion);
    }
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Mesa MCP request failed (HTTP ${response.status}).`);
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) this.sessionId = sessionId;
    const messages = parsePayload(await response.text(), response.headers.get("content-type") ?? "");
    if (!expectsResponse) return messages.find((message) => message.id !== undefined) ?? {};
    const message = messages.find((candidate) => candidate.id === id);
    if (!message) throw new Error("Mesa MCP did not return the expected protocol response.");
    return message;
  }

  private async sendNotification(method: string): Promise<void> {
    const headers = new Headers({ accept: "application/json, text/event-stream", "content-type": "application/json" });
    if (this.sessionId) {
      headers.set("mcp-session-id", this.sessionId);
      headers.set("mcp-protocol-version", this.protocolVersion);
    }
    const response = await this.fetcher(this.endpoint, {
      method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method }), cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Mesa MCP handshake notification failed (HTTP ${response.status}).`);
  }
}

export function getMesaMcpEndpoint(token: string): string {
  return `https://students.mesaschool.co.in/mcp/${encodeURIComponent(token)}`;
}
