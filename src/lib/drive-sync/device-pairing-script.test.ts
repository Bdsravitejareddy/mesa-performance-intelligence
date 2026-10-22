import vm from "node:vm";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderDriveScript } from "./script";

describe("secret-free installer", () => {
  it("contains no pairing code, registers only a hash, waits for approval, then pairs with its own code", async () => {
    const rendered = await renderDriveScript({ baseUrl: "https://dashboard.example", storageOrigin: "https://project.supabase.co" });
    expect(rendered.code).not.toContain("pairingCode\":");
    const properties: Record<string, string> = { connectorToken: "stale", connectionId: "old" };
    const calls: { path: string; body: Record<string, string> }[] = [];
    const logs: string[] = [];
    let statusChecks = 0;
    const response = (body: unknown) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(body), getAllHeaders: () => ({}) });
    const context = vm.createContext({
      Date, Logger: { log: (line: string) => logs.push(line) }, console,
      Utilities: {
        sleep: () => {}, getUuid: () => Math.random().toString(36), base64EncodeWebSafe: (bytes: number[]) => Buffer.from(bytes.map((b) => (b + 256) % 256)).toString("base64url") + "=",
        computeDigest: (_: unknown, text: string) => Array.from(createHash("sha256").update(text).digest()).map((b) => (b > 127 ? b - 256 : b)),
        DigestAlgorithm: { SHA_256: "sha" }, Charset: { UTF_8: "utf8" }, newBlob: (text: string) => ({ getBytes: () => Array.from(Buffer.from(text)) }),
      },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => properties[key] ?? null, setProperty: (key: string, value: string) => { properties[key] = value; }, deleteProperty: (key: string) => { delete properties[key]; } }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
      ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => {} }) }), after: () => ({ create: () => {} }) }) }), getOAuthToken: () => "google", deleteTrigger: () => {} },
      UrlFetchApp: { fetch: (url: string, options: { payload?: string }) => {
        const path = new URL(url).pathname.split("/").pop()!;
        const body = options.payload ? JSON.parse(options.payload) : {};
        calls.push({ path, body });
        if (path === "pair-request") return response({ displayCode: "ABCD-2345", expiresAt: "x" });
        if (path === "pair-status") { statusChecks += 1; return response({ approved: statusChecks >= 2, expired: false }); }
        if (path === "pair") return response({ token: "new-token", connectionId: "connection" });
        if (path === "session") throw new Error("stop after pairing");
        return response({});
      } },
    });
    vm.runInContext(rendered.code, context);
    try { vm.runInContext("install()", context); } catch { /* the first scan is outside this test */ }
    const request = calls.find((call) => call.path === "pair-request")!;
    const pair = calls.find((call) => call.path === "pair")!;
    expect(request.body.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pair.body.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createHash("sha256").update(pair.body.code).digest("hex")).toBe(request.body.codeHash);
    expect(statusChecks).toBe(2);
    expect(properties).toMatchObject({ connectorToken: "new-token", connectionId: "connection" });
    expect(logs[0]).toContain("ABCD-2345");
  });
});
