import { describe, expect, it } from "vitest";
import { resolveSubmissionDocuments, validateSubmissionDocumentUpload } from "./submission-documents";

describe("submission document access", () => {
  it("keeps metadata-only LMS assignments explicitly unavailable", () => {
    expect(resolveSubmissionDocuments({ id: "assignment-1", title: "Case study", status: "graded", grade: 84 })).toEqual({ status: "unavailable", references: [] });
  });

  it.each([null, undefined, [], "https://example.com/file.pdf", { url: "https://example.com/file.pdf" }, { attachment_url: "http://localhost/private" }, { attachments: [{ id: "file-1", filename: "answer.pdf", mime_type: "application/pdf", url: "https://students.mesaschool.co.in/answer.pdf" }] }])("does not invent an attachment contract or trust arbitrary URL fields (%j)", (record) => {
    expect(resolveSubmissionDocuments(record)).toEqual({ status: "unavailable", references: [] });
  });

  it.each(["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"])("accepts %s at the inclusive 20 MiB boundary", (type) => {
    expect(validateSubmissionDocumentUpload({ size: 20 * 1024 * 1024, type })).toBeNull();
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 20 * 1024 * 1024 + 1])("rejects invalid or oversized file size %s", (size) => {
    expect(validateSubmissionDocumentUpload({ size, type: "application/pdf" })).toBeTruthy();
  });

  it.each(["", "application/octet-stream", "application/msword", "text/html"])("rejects unsupported MIME type %s", (type) => {
    expect(validateSubmissionDocumentUpload({ size: 1, type })).toBeTruthy();
  });
});
