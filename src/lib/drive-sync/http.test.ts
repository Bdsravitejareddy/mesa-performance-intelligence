import { describe, expect, it } from "vitest";
import { HttpError, jsonError, readJsonBody } from "./http";

describe("bounded machine JSON requests", () => {
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
});
