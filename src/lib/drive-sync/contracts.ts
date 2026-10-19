export type FolderMapping = {
  id: string;
  driveFolderId: string;
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
