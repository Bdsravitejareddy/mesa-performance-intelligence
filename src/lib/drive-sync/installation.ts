import "server-only";
import { issuePairing } from './auth';
import { HttpError } from './http';
import { renderDriveScript } from './script';

/** Canonical origin comes from deployment configuration, never request/Host headers. */
export function requireInstallationConfig() {
  const baseUrl = process.env.APP_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try {
    for (const value of [baseUrl, storageOrigin]) {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.origin !== value.replace(/\/$/, '') || url.username || url.password) throw new Error('Invalid origin');
    }
  } catch { throw new HttpError(503, 'Set the canonical HTTPS APP_BASE_URL and Supabase URL before downloading an installer.'); }
  return {baseUrl,storageOrigin};
}

export async function issueInstallation(connectionId: string) {
  const {baseUrl,storageOrigin}=requireInstallationConfig();
  const pairing = await issuePairing(connectionId);
  return {...pairing, setup: await renderDriveScript({baseUrl,storageOrigin,pairingCode:pairing.pairingCode})};
}

// The secret-free installer for device pairing.
export async function deviceInstaller() {
  const {baseUrl,storageOrigin}=requireInstallationConfig();
  return renderDriveScript({baseUrl,storageOrigin});
}
