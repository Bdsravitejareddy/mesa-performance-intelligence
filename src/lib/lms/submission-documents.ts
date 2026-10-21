export type SubmissionDocumentReference = {
  sourceKind: "lms" | "drive" | "upload";
  sourceId: string;
  filename: string;
  mimeType: string;
  sourceUrl: string | null;
  version: string;
};

export const MAX_SUBMISSION_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const SUBMISSION_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

/**
 * The repository-observed Nexus assignment/grade contract contains no verified
 * document access fields. Fail closed until an authenticated official schema
 * and detail response establish one. A URL in record content is never authority
 * to fetch a file, including a URL on the LMS host.
 */
export function resolveSubmissionDocuments(record: unknown): {
  status: "available" | "unavailable";
  references: SubmissionDocumentReference[];
} {
  void record;
  return { status: "unavailable", references: [] };
}

/** Metadata validation only; callers must also parse the uploaded bytes. */
export function validateSubmissionDocumentUpload(file: { size: number; type: string }): string | null {
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_SUBMISSION_DOCUMENT_BYTES) {
    return "Choose a non-empty file up to 20 MiB.";
  }
  if (!SUBMISSION_DOCUMENT_MIME_TYPES.some((type) => type === file.type)) {
    return "Choose a PDF or PPTX file.";
  }
  return null;
}
