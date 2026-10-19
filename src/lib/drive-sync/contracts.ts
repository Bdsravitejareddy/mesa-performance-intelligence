export type FolderMapping = {
  id: string;
  driveFolderId: string;
  resourceKey?: string | null;
  mode: "course" | "collection";
  courseId?: string | null;
  rootCourseTitle: string;
};
export type FolderMappingInput = Omit<FolderMapping, "id">;
export type DriveConnection = {
  id: string;
  userId: string;
  enabled: boolean;
  label: string;
  mappingRevision: number;
  mappings: FolderMapping[];
};
export type SourceFile = {
  driveFileId: string;
  name: string;
  mimeType: string;
  parentId: string;
  targetId?: string;
  sourceUrl: string;
  fingerprint: string;
  size?: number;
  folderMappingId: string;
  courseFolderId: string;
  courseFolderTitle: string;
};
export type ScanFolder = {
  id: string;
  courseFolderId: string;
  courseFolderTitle: string;
  pageToken?: string;
  resourceKey?: string;
};
export type RootCheckpoint = {
  pendingFolders: ScanFolder[];
  visitedFolderIds: string[];
  completed: boolean;
  failed: boolean;
  pendingFiles?: SourceFile[];
  nextPageToken?: string;
};
export type ScanCheckpoint = { roots: Record<string, RootCheckpoint> };
export type ImportItem = {
  itemId: string;
  storagePath: string;
  exportFormat: "pdf" | "pptx";
};
export type ImportDecision =
  | ({ decision: "upload" } & ImportItem)
  | { decision: "unchanged" | "unsupported" | "conflict" | "retry_later"; itemId?: string };

export type DriveSourceStatus = {
  id: string; driveFileId: string; name: string; sourceUrl: string | null; courseId: string;
  exportFormat: string; available: boolean; version: number; failureCount: number;
  failureCode: string | null; extractionStatus: string | null;
};
export type DriveOperationalStatus = {
  id: string; paired: boolean; lastSuccessfulScanAt: string | null;
  latestScan: null | { id: string; status: string; startedAt: string; completedAt: string | null; partial: boolean; completedRoots: number; imported: number; unchanged: number };
  counts: { total: number; indexed: number; unsupported: number; failed: number; unavailable: number };
  sources: DriveSourceStatus[];
};
export type DriveConnectionStatus = DriveConnection & {
  lastError: string | null; lastScanAt: string | null;
} & Omit<DriveOperationalStatus, 'id'>;
