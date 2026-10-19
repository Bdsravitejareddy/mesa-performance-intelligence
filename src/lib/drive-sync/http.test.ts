import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, jsonError, readJsonBody } from "./http";

describe("bounded machine JSON requests", () => {
  afterEach(() => vi.restoreAllMocks());
  const request = (body: string, headers: Record<string, string> = {}) => new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  it("rejects a forged small Content-Length when actual UTF-8 bytes exceed the cap", async () => {
    await expect(readJsonBody(request(JSON.stringify({ data: "é".repeat(270_000) }), { "Content-Length": "1" }))).rejects.toMatchObject({ status: 413 });
  });
  it("rejects a declared oversize body before reading", async () => {
    await expect(readJsonBody(request("{}", { "Content-Length": "524289" }))).rejects.toMatchObject({ status: 413 });
  });
  it("does not accept form or text metadata as JSON", async () => {
    await expect(readJsonBody(request("{}", { "Content-Type": "text/plain" }))).rejects.toMatchObject({ status: 400 });
  });
  it("returns sanitized unexpected failures and explicit HTTP errors", async () => {
    expect(await jsonError(new Error("secret-database-error")).json()).toEqual({ error: "Drive sync is temporarily unavailable." });
    expect(jsonError(new HttpError(429, "Try later")).status).toBe(429);
  });
  it("logs a useful diagnostic for unexpected failures without logging secret keys", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("Supabase request failed for sb_secret_do_not_log"), { code: "PGRST202" });
    await jsonError(error);
    expect(log).toHaveBeenCalledOnce();
    const diagnostic = JSON.stringify(log.mock.calls[0]);
    expect(diagnostic).toContain("PGRST202");
    expect(diagnostic).toContain("Supabase request failed");
    expect(diagnostic).not.toContain("sb_secret_do_not_log");
  });
});
