import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, POST } from "./route";

const { from, auth, insert, storageUpload, storageRemove, authUser } = vi.hoisted(() => ({
  from: vi.fn(), auth: { getClaims: vi.fn() }, insert: vi.fn(), storageUpload: vi.fn(), storageRemove: vi.fn(), authUser: { id: "member" as string | null },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth, from, storage: { from: () => ({ upload: storageUpload, remove: storageRemove }) } }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));
const { courseLinks } = vi.hoisted(() => ({ courseLinks: { value: [] as { assessment_course_id: string; material_course_id: string }[] } }));
vi.mock("@/lib/courses/links", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/courses/links")>();
  return { ...actual, loadRelatedCourseIds: async (_client: unknown, courseId: string) => actual.relatedCourseIds(courseId, courseLinks.value) };
});
vi.mock("@/lib/documents", () => ({
  extractPdfPages: vi.fn(async () => [{ pageNumber: 1, text: "Synthetic answer", tables: [], hasVisuals: false }]),
  extractPptxSlides: vi.fn(async () => [{ slideNumber: 1, text: "Synthetic answer slide", tables: [], hasVisuals: true }]),
}));

const submission = { id: "submission", user_id: "owner", assessment_id: "assessment" };
const assessment = { id: "assessment", course_id: "course" };
const material = { id: "material", user_id: "owner", course_id: "course", assessment_id: null, name: "Lecture.pdf", mime_type: "application/pdf", file_size: 100, version: 2, extraction_status: "complete", drive_source_id: "drive-source" };
let materialRow: typeof material | null = material;
let assessmentRow: typeof assessment | null = assessment;
let submissionRow: typeof submission | null = submission;
let inserted: Record<string, unknown> | null = null;
let removedObjects: string[][] = [];
let failStorageRemove = false;
let failDocumentDelete = false;
let documentRow: { id: string; storage_path: string | null } | null = null;
let documentDeleteAttempts = 0;
let existingEvidence: { id: string; submission_id: string; source_kind: string; source_version: string; course_material_id: string | null; name: string; extraction_status: string } | null = null;
let duplicateInsert = false;

function responseRequest(blob: Blob, filename: string, mime: string, id = "submission") {
  const form = new FormData();
  form.set("file", new File([blob], filename, { type: mime }));
  return new NextRequest(`https://example.com/api/submissions/${id}/documents`, { method: "POST", body: form });
}
function materialRequest(courseMaterialId: string, id = "submission") {
  return new NextRequest(`https://example.com/api/submissions/${id}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseMaterialId }) });
}
function context(id = "submission") { return { params: Promise.resolve({ id }) }; }

function makeQuery(table: string) {
  const filters: Record<string, unknown> = {};
  const q: Record<string, (...args: unknown[]) => unknown> = {};
  q.select = () => q;
  q.eq = (column, value) => { filters[String(column)] = value; return q; };
  q.order = () => Promise.resolve({ data: table === "material_pages" ? [{ page_number: 1, extracted_text: "Course evidence", table_data: [], has_visuals: false }] : [] });
  q.maybeSingle = async () => {
    const isExistingEvidence = table === "submission_documents" && existingEvidence && Object.entries(filters).every(([key, value]) => existingEvidence?.[key as keyof typeof existingEvidence] === value);
    const data = table === "submissions" ? submissionRow : table === "assessments" ? assessmentRow : table === "course_materials" ? materialRow : table === "submission_documents" && filters.id === "document" && filters.submission_id === "submission" ? documentRow : isExistingEvidence ? existingEvidence : null;
    return { data, error: null };
  };
  q.insert = (row) => {
    inserted = row as Record<string, unknown>;
    return { select: () => ({ single: async () => (duplicateInsert ? { data: null, error: { code: "23505", message: "duplicate key" } } : { data: { id: "document" }, error: null }) }) };
  };
  q.delete = () => ({ eq: () => ({ eq: async () => { documentDeleteAttempts += 1; return { error: failDocumentDelete ? { message: "database unavailable" } : null }; } }) });
  q.in = () => ({ order: async () => ({ data: [] }) });
  return q;
}

describe("private submission evidence route", () => {
  afterEach(() => { vi.clearAllMocks(); inserted = null; removedObjects = []; materialRow = material; assessmentRow = assessment; submissionRow = submission; authUser.id = "member"; failStorageRemove = false; failDocumentDelete = false; documentRow = null; documentDeleteAttempts = 0; existingEvidence = null; duplicateInsert = false; });
  beforeEach(() => {
    auth.getClaims.mockImplementation(async () => ({ data: { claims: authUser.id ? { sub: authUser.id } : {} } }));
    from.mockImplementation((table: string) => makeQuery(table));
    storageUpload.mockResolvedValue({ error: null });
    storageRemove.mockImplementation(async (paths: string[]) => { removedObjects.push(paths); return { error: failStorageRemove ? { message: "storage unavailable" } : null }; });
  });

  it("uploads and extracts a PDF into a private submission-scoped object", async () => {
    const res = await POST(responseRequest(new Blob(["%PDF-synthetic"]), "answer.pdf", "application/pdf"), context());
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    expect(inserted).toEqual(expect.objectContaining({ user_id: "owner", submission_id: "submission", source_kind: "upload", name: "answer.pdf", mime_type: "application/pdf", extracted_text: "[Page or slide 1]\nSynthetic answer", extraction_status: "complete" }));
    expect(storageUpload).toHaveBeenCalledWith(expect.stringMatching(/^owner\/submission\//), expect.any(Uint8Array), expect.objectContaining({ upsert: false, contentType: "application/pdf" }));
    const { extractPdfPages } = await import("@/lib/documents");
    expect(extractPdfPages).toHaveBeenCalledWith(expect.any(Uint8Array), expect.objectContaining({ maxPages: 500, maxTextCharacters: 1_000_000, timeoutMs: 30_000 }));
  });

  it("uploads and extracts a PPTX while retaining visual review status", async () => {
    const res = await POST(responseRequest(new Blob(["PK\u0003\u0004synthetic"]), "answer.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"), context());
    expect(res.status).toBe(201);
    expect(inserted).toEqual(expect.objectContaining({ mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extraction_status: "needs_visual_review", extracted_text: "[Page or slide 1]\nSynthetic answer slide" }));
    const { extractPptxSlides } = await import("@/lib/documents");
    expect(extractPptxSlides).toHaveBeenCalledWith(expect.any(Uint8Array), expect.objectContaining({ maxPages: 500, maxUncompressedBytes: 80 * 1024 * 1024, maxZipEntries: 4096, maxEntryBytes: 16 * 1024 * 1024, maxSlideBytes: 4 * 1024 * 1024 }));
  });

  it("links only an already indexed course material in the assessment course", async () => {
    const res = await POST(materialRequest("material"), context());
    expect(res.status).toBe(201);
    expect(inserted).toEqual(expect.objectContaining({ source_kind: "drive", source_id: "drive-source", course_material_id: "material", extracted_text: "[Page or slide 1]\nCourse evidence", source_version: "2" }));
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("returns the already-linked material when the client retries after losing the response", async () => {
    existingEvidence = { id: "already-linked", submission_id: "submission", source_kind: "drive", source_version: "2", course_material_id: "material", name: "Lecture.pdf", extraction_status: "complete" };
    const response = await POST(materialRequest("material"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "already-linked", name: "Lecture.pdf" });
    expect(inserted).toBeNull();
  });

  it("returns existing uploaded evidence for an identical retry without creating another object", async () => {
    existingEvidence = { id: "existing-upload", submission_id: "submission", source_kind: "upload", source_version: `sha256:${await import("node:crypto").then(({ createHash }) => createHash("sha256").update("%PDF-synthetic").digest("hex"))}`, course_material_id: null, name: "answer.pdf", extraction_status: "complete" };
    const response = await POST(responseRequest(new Blob(["%PDF-synthetic"]), "answer.pdf", "application/pdf"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "existing-upload", name: "answer.pdf" });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("removes a newly uploaded object when a concurrent identical request wins the unique insert", async () => {
    const { createHash } = await import("node:crypto");
    const winner = { id: "race-winner", submission_id: "submission", source_kind: "upload", source_version: `sha256:${createHash("sha256").update("%PDF-synthetic").digest("hex")}`, course_material_id: null, name: "answer.pdf", extraction_status: "complete" };
    storageUpload.mockImplementation(async () => { existingEvidence = winner; return { error: null }; });
    duplicateInsert = true;
    const response = await POST(responseRequest(new Blob(["%PDF-synthetic"]), "answer.pdf", "application/pdf"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "race-winner" });
    expect(storageUpload).toHaveBeenCalledOnce();
    expect(storageRemove).toHaveBeenCalledWith([expect.stringMatching(/^owner\/submission\//)]);
  });

  it("rejects a submission from a different course", async () => {
    assessmentRow = { ...assessment, course_id: "other-course" };
    expect((await POST(materialRequest("material"), context())).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts material from a member-confirmed linked Drive course", async () => {
    materialRow = { ...material, course_id: "drive-course" };
    courseLinks.value = [{ assessment_course_id: "course", material_course_id: "drive-course" }];
    expect((await POST(materialRequest("material"), context())).status).toBe(201);
    courseLinks.value = [];
  });

  it("rejects a course material that does not match the assessment course", async () => {
    materialRow = { ...material, course_id: "other-course" };
    expect((await POST(materialRequest("material"), context())).status).toBe(400);
    expect(inserted).toBeNull();
  });

  it("rejects unsupported MIME, mismatched extension, and files over 20 MiB", async () => {
    expect((await POST(responseRequest(new Blob(["bad"]), "answer.docx", "application/msword"), context())).status).toBe(415);
    expect((await POST(responseRequest(new Blob(["bad"]), "answer.pdf", "application/pdf"), context())).status).toBe(415);
    const large = new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]);
    expect((await POST(responseRequest(large, "large.pdf", "application/pdf"), context())).status).toBe(413);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests before touching workspace records", async () => {
    authUser.id = null;
    expect((await POST(materialRequest("material"), context())).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("removes the uploaded object when extraction fails", async () => {
    const { extractPdfPages } = await import("@/lib/documents");
    vi.mocked(extractPdfPages).mockRejectedValueOnce(new Error("invalid PDF"));
    expect((await POST(responseRequest(new Blob(["%PDF-synthetic"]), "broken.pdf", "application/pdf"), context())).status).toBe(422);
    expect(storageRemove).toHaveBeenCalledTimes(1);
    expect(removedObjects[0][0]).toMatch(/^owner\/submission\//);
    expect(inserted).toBeNull();
  });

  it("reports an unconfirmed private-object cleanup when parsing fails", async () => {
    const { extractPdfPages } = await import("@/lib/documents");
    vi.mocked(extractPdfPages).mockRejectedValueOnce(new Error("page limit exceeded"));
    failStorageRemove = true;
    const response = await POST(responseRequest(new Blob(["%PDF-synthetic"]), "large.pdf", "application/pdf"), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("cleanup could not be confirmed") });
    expect(inserted).toBeNull();
  });

  it("removes an attached evidence row only for its owning submission", async () => {
    documentRow = { id: "document", storage_path: null };
    const makeDeleteRequest = () => new NextRequest("https://example.com/api/submissions/submission/documents", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: "document" }) });
    const res = await DELETE(makeDeleteRequest(), context());
    expect(res.status).toBe(200);
    const mismatched = await DELETE(makeDeleteRequest(), context("another-submission"));
    expect(mismatched.status).toBe(404);
  });

  it("keeps the private object when the evidence-row delete fails", async () => {
    documentRow = { id: "document", storage_path: "owner/submission/file/answer.pdf" };
    failDocumentDelete = true;
    const req = new NextRequest("https://example.com/api/submissions/submission/documents", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: "document" }) });
    const response = await DELETE(req, context());
    expect(response.status).toBe(400);
    expect(documentDeleteAttempts).toBe(1);
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("detaches the evidence row before reporting failed private-file cleanup", async () => {
    documentRow = { id: "document", storage_path: "owner/submission/file/answer.pdf" };
    failStorageRemove = true;
    const req = new NextRequest("https://example.com/api/submissions/submission/documents", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: "document" }) });
    const response = await DELETE(req, context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ removed: true, warning: expect.stringContaining("private file cleanup failed") });
    expect(documentDeleteAttempts).toBe(1);
    expect(storageRemove).toHaveBeenCalledTimes(1);
  });
});
