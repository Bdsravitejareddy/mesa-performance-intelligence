import { readFile } from "node:fs/promises";
import path from "node:path";

export type DriveScriptConfig = { baseUrl: string; storageOrigin: string; pairingCode: string };

function httpsOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Drive agent configuration requires an HTTPS origin");
  }
  return url.origin;
}

/** Produces a standalone script; credentials issued after pairing never enter this source. */
export async function renderDriveScript(config: DriveScriptConfig): Promise<{ code: string; manifest: string }> {
  if (typeof config.pairingCode !== "string" || !config.pairingCode || config.pairingCode.length > 4096) {
    throw new Error("A valid pairing code is required");
  }
  const bootstrap = { baseUrl: httpsOrigin(config.baseUrl), storageOrigin: httpsOrigin(config.storageOrigin), pairingCode: config.pairingCode };
  const directory = path.join(process.cwd(), "integrations", "apps-script");
  const [template, manifest] = await Promise.all([readFile(path.join(directory, "Code.gs"), "utf8"), readFile(path.join(directory, "appsscript.json"), "utf8")]);
  const encoded = JSON.stringify(bootstrap).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return { code: template.replace("/*__DRIVE_AGENT_CONFIG__*/null", () => encoded), manifest };
}
