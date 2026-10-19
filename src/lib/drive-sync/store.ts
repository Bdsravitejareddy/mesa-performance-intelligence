import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedPage } from "../documents";
import type { DriveConnection, DriveOperationalStatus, FolderMapping, FolderMappingInput, ImportDecision, ScanCheckpoint, SourceFile } from "./contracts";

type Identity = { connectionId: string; userId: string };

/** Server-side only: pass a service-role client; no connector secrets are stored here. */
export class DriveSyncStore {
  constructor(private readonly client: Pick<SupabaseClient, "rpc">) {}

  private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(`drive_sync_${name}`, args);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data as T;
  }

  configure(userId: string, connectionId: string | null, mappings: FolderMappingInput[], label = "", enabled = true, expectedMappingRevision?: number): Promise<DriveConnection> {
    const args = { p_user_id: userId, p_connection_id: connectionId, p_mappings: mappings, p_label: label, p_enabled: enabled };
    return expectedMappingRevision === undefined
      ? this.call("configure", args)
      : this.call("configure_if_current", { ...args, p_expected_mapping_revision: expectedMappingRevision });
  }
  status(connectionIds: string[]): Promise<DriveOperationalStatus[]> {
    return this.call("status", { p_connection_ids: connectionIds });
  }
  checkPairingBudget(callerHash: string, codeHash: string): Promise<boolean> {
    return this.call("attempt_pairing_scoped", { p_caller_hash: callerHash, p_code_hash: codeHash });
  }
  issuePairing(connectionId: string, hash: string, expiresAt: string): Promise<void> {
    return this.call("issue_pairing", { p_connection_id: connectionId, p_hash: hash, p_expires_at: expiresAt });
  }
  consumePairing(pairingHash: string, tokenHash: string): Promise<Identity> {
    return this.call("consume_pairing", { p_pairing_hash: pairingHash, p_token_hash: tokenHash });
  }
  authenticate(tokenHash: string): Promise<Identity | null> {
    return this.call("authenticate", { p_token_hash: tokenHash });
  }
  startScan(connectionId: string): Promise<{scanId: string; checkpoint: ScanCheckpoint; mappings: FolderMapping[]}> {
    return this.call("start_scan", { p_connection_id: connectionId });
  }
  reserve(connectionId: string, scanId: string, source: SourceFile): Promise<ImportDecision> {
    return this.call("reserve", { p_connection_id: connectionId, p_scan_id: scanId, p_source: source });
  }
  publish(connectionId: string, itemId: string, pages: ExtractedPage[], objectSize: number): Promise<{materialId: string; version: number}> {
    return this.call("publish", { p_connection_id: connectionId, p_item_id: itemId, p_pages: pages, p_object_size: objectSize });
  }
  checkpoint(connectionId: string, scanId: string, value: ScanCheckpoint, completedRootIds: string[]): Promise<void> {
    return this.call("checkpoint", { p_connection_id: connectionId, p_scan_id: scanId, p_value: value, p_completed_root_ids: completedRootIds });
  }
  revoke(connectionId: string): Promise<void> {
    return this.call("revoke", { p_connection_id: connectionId });
  }
  recordError(connectionId: string, message: string, itemId?: string): Promise<void> {
    return this.call("record_error", { p_connection_id: connectionId, p_message: message, p_item_id: itemId ?? null });
  }
}
