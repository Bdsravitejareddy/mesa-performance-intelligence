import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachDocument, attachLinkedFiles, matchDriveSubmissions, shortlistAssessment, titleScore } from "./submission-matching";

describe("matching Drive files to assessments by name", () => {
  const assessments = [
    { id: "a1", title: "Session 6 Zepto Async assignment" },
    { id: "a2", title: "Session 6 Zepto Workbook" },
    { id: "a3", title: "Session 7 Lenskart Async Assignment" },
    { id: "a4", title: "Mid-Term Assignment" },
  ];

  it("scores distinctive words and ignores copy markers, versions and extensions", () => {
    expect(titleScore("Zepto Async Assignment - Ravi (1).docx", "Session 6 Zepto Async assignment")).toBeGreaterThan(0.6);
    expect(titleScore("Lecture 4 slides.pptx", "Session 6 Zepto Async assignment")).toBe(0);
  });

  it("shortlists only a clear winner", () => {
    expect(shortlistAssessment("Session 7 Lenskart Async Assignment final.docx", assessments)?.assessment.id).toBe("a3");
    expect(shortlistAssessment("Zepto.docx", assessments)).toBeNull();
    expect(shortlistAssessment("Budget template.xlsx", assessments)).toBeNull();
  });
});

type Row = Record<string, unknown>;
function fakeClient(tables: Record<string, Row[]>) {
  const writes: { table: string; op: string; row: unknown }[] = [];
  return {
    writes,
    from(table: string) {
      const filters: [string, unknown][] = [];
      const rows = () => (tables[table] ?? []).filter((row) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
      const chain: Record<string, unknown> = {};
      let write: unknown = null;
      for (const method of ["select", "order", "limit", "not", "is"]) chain[method] = () => chain;
      chain.eq = (key: string, value: unknown) => { filters.push([key, value]); return chain; };
      chain.in = (key: string, value: unknown[]) => { filters.push([key, value]); return chain; };
      chain.upsert = (row: unknown) => { writes.push({ table, op: "upsert", row }); write = row; return chain; };
      chain.insert = (row: unknown) => { writes.push({ table, op: "insert", row }); write = row; return chain; };
      chain.update = (row: unknown) => { writes.push({ table, op: "update", row }); write = row; return chain; };
      chain.single = async () => ({ data: { id: `${table}-new`, ...(write as Row) }, error: null });
      chain.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(write ? { error: null } : { data: rows(), error: null }).then(resolve);
      return chain;
    },
  };
}

describe("recognising submissions among Drive files", () => {
  beforeEach(() => { vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true"); vi.stubEnv("GEMINI_API_KEY", "g"); vi.stubEnv("AI_API_BASE_URL", ""); vi.stubEnv("AI_API_KEY", ""); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  const tables = () => ({
    course_links: [{ assessment_course_id: "lms", material_course_id: "drive" }],
    current_course_materials: [{ id: "m-sub" }, { id: "m-template" }, { id: "m-slides" }],
    material_submission_matches: [],
    lms_unassigned_assignments: [],
    course_materials: [
      { id: "m-sub", user_id: "owner", name: "Zepto Async Assignment - Ravi.docx", course_id: "drive", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", file_size: 100, version: 1, extraction_status: "complete", drive_source_id: "ds1" },
      { id: "m-template", user_id: "owner", name: "Session 7 Lenskart Async Assignment.pdf", course_id: "drive", mime_type: "application/pdf", file_size: 100, version: 1, extraction_status: "complete", drive_source_id: "ds2" },
      { id: "m-slides", user_id: "owner", name: "Lecture 3 slides.pptx", course_id: "drive", mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", file_size: 100, version: 1, extraction_status: "complete", drive_source_id: "ds3" },
    ],
    assessments: [{ id: "a1", user_id: "owner", course_id: "lms", title: "Session 6 Zepto Async assignment" }, { id: "a3", user_id: "owner", course_id: "lms", title: "Session 7 Lenskart Async Assignment" }],
    material_pages: [{ material_id: "m-sub", page_number: 1, extracted_text: "My analysis: Zepto's AOV rose because..." }, { material_id: "m-template", page_number: 1, extracted_text: "Instructions: answer the following in your own words." }],
    submissions: [],
  });

  it("attaches the student's work, leaves templates and slides as course material", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const isSubmission = String(body.messages[1].content).includes("My analysis");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(isSubmission ? { kind: "submission", confidence: "high", reason: "Contains the student's own analysis." } : { kind: "course_material", confidence: "high", reason: "Blank instructions." }) } }] }));
    }));
    const client = fakeClient(tables());
    const outcomes = await matchDriveSubmissions(client as never, 60_000);
    expect(outcomes.map((item) => [item.materialId, item.kind, item.attached])).toEqual([["m-sub", "submission", true], ["m-template", "course_material", false], ["m-slides", "course_material", false]]);
    expect(client.writes.find((write) => write.table === "submissions" && write.op === "insert")?.row).toMatchObject({ assessment_id: "a1", source_record_id: "drive-submission:m-sub" });
    expect(client.writes.find((write) => write.table === "submission_documents")?.row).toMatchObject({ source_kind: "drive", course_material_id: "m-sub", source_version: "1" });
  });

  it("does not attach anything when AI classification is off", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = fakeClient(tables());
    const outcomes = await matchDriveSubmissions(client as never, 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcomes.filter((item) => item.attached)).toEqual([]);
    expect(outcomes.find((item) => item.materialId === "m-sub")?.kind).toBe("undetermined");
  });
});

describe("attaching a Drive file to a submission at most once", () => {
  const version = (id: string, n: number) => ({ id, user_id: "owner", name: "Ops Week Hackathon", mime_type: "application/pdf", file_size: 100, version: n, extraction_status: "complete", drive_source_id: "ds1" });
  const tables = (documents: Row[], matches: Row[] = []) => ({
    course_materials: [version("m1", 1), version("m2", 2), version("m3", 3)],
    material_submission_matches: matches,
    submission_documents: documents,
  });

  it("replaces the attached row when a later Drive version arrives instead of adding another", async () => {
    const client = fakeClient(tables([{ id: "d1", submission_id: "s1", source_kind: "drive", source_id: "ds1", course_material_id: "m1", source_version: "1" }]));
    expect(await attachDocument(client as never, version("m2", 2), "s1", "owner", "text", "complete")).toBe("replaced");
    expect(client.writes.filter((write) => write.table === "submission_documents").map((write) => write.op)).toEqual(["update"]);
    expect(client.writes[0].row).toMatchObject({ course_material_id: "m2", source_version: "2" });
  });

  it("treats the same or an older version as already attached", async () => {
    const client = fakeClient(tables([{ id: "d1", submission_id: "s1", source_kind: "drive", source_id: "ds1", course_material_id: "m3", source_version: "3" }]));
    expect(await attachDocument(client as never, version("m3", 3), "s1", "owner", "text", "complete")).toBe("duplicate");
    expect(await attachDocument(client as never, version("m2", 2), "s1", "owner", "text", "complete")).toBe("duplicate");
    expect(client.writes).toEqual([]);
  });

  it("keeps every version off a submission once a member detached one of them", async () => {
    const client = fakeClient(tables([], [{ material_id: "m1", method: "member" }]));
    expect(await attachDocument(client as never, version("m3", 3), "s1", "owner", "text", "complete")).toBe("detached_by_member");
    expect(client.writes).toEqual([]);
  });

  it("attaches three successive versions linked on Nexus as one document", async () => {
    const documents: Row[] = [];
    const tablesWithLink = { ...tables(documents), submission_links: [{ submission_id: "s1", drive_file_id: "f1" }], drive_sources: [{ drive_file_id: "f1", current_material_id: "m1" }], submissions: [{ id: "s1", user_id: "owner", assessment_id: "a1" }], material_pages: [] };
    const client = fakeClient(tablesWithLink);
    for (const current of ["m1", "m2", "m3"]) {
      tablesWithLink.drive_sources[0].current_material_id = current;
      await attachLinkedFiles(client as never);
      // The fake does not persist writes, so mirror them: one row, moved to the newest version.
      const write = client.writes.filter((item) => item.table === "submission_documents").at(-1)!;
      if (write.op === "insert") documents.push({ id: "d1", ...(write.row as Row) });
      else Object.assign(documents[0], write.row as Row);
    }
    expect(client.writes.filter((write) => write.table === "submission_documents").map((write) => write.op)).toEqual(["insert", "update", "update"]);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ course_material_id: "m3", source_version: "3" });
  });
});
