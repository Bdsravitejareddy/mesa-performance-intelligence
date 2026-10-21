import type { McpTool } from "./mcp-client";

export function selectAssignmentReadTools(tools: McpTool[]): McpTool[] {
  return tools.filter((tool) => {
    const name = tool.name.toLowerCase().replace(/[^a-z]/g, "");
    const isReadCollection = /^(list|fetch|search|get|getmy|getcourse|listmy|fetchmy).*(assignments?|grades?|marks?)$/.test(name);
    if (!isReadCollection) return false;
    const schema = tool.inputSchema;
    const required = schema && Array.isArray(schema.required) ? schema.required : [];
    return required.length === 0;
  });
}

export function toolArgumentVariants(tool: McpTool): Record<string, unknown>[] | null {
  const schema = tool.inputSchema ?? {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (required.length) return null;
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties as Record<string, unknown> : {};
  const defaults: Record<string, unknown> = {};
  let statusOptions: unknown[] | undefined;
  for (const [key, value] of Object.entries(properties)) {
    const property = value && typeof value === "object" ? value as Record<string, unknown> : {};
    if (property.default !== undefined) defaults[key] = property.default;
    if (/^status$/i.test(key) && Array.isArray(property.enum)) statusOptions = property.enum;
  }
  return statusOptions?.length ? statusOptions.map((status) => ({ ...defaults, status })) : [defaults];
}

export function assignmentDetailArguments(tool: McpTool, assignmentId: string): Record<string, unknown> | null {
  const schema = tool.inputSchema ?? {};
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties as Record<string, unknown> : {};
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  const key = required.find((name) => /^assignment_?id$/i.test(name) && Object.hasOwn(properties, name))
    ?? Object.keys(properties).find((name) => /^assignment_?id$/i.test(name));
  if (!key) return null;
  const defaults: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(properties)) {
    const property = value && typeof value === "object" ? value as Record<string, unknown> : {};
    if (property.default !== undefined) defaults[name] = property.default;
  }
  return { ...defaults, [key]: assignmentId };
}
