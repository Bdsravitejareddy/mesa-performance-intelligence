// The assignment brief from get_assignment: description, instructions and attached-material names. Text only;
// links are kept as labels so the brief never becomes a list of URLs to fetch.
export function briefFromAssignment(value: unknown): string {
  const row = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const text = (item: unknown) => (typeof item === "string" ? item.replace(/\s+\n/g, "\n").trim() : "");
  const materials = Array.isArray(row.materials) ? (row.materials as Record<string, unknown>[]).map((item) => text(item.title) || text(item.fileName) || (text(item.link) ? "linked resource" : "")).filter(Boolean) : [];
  const parts = [
    text(row.description) && `Brief:\n${text(row.description)}`,
    text(row.instructions) && `Instructions:\n${text(row.instructions)}`,
    materials.length ? `Attached materials: ${materials.join("; ")}` : "",
    typeof row.submissionType === "string" ? `Submission type: ${row.submissionType}` : "",
    typeof row.maxMarks === "number" ? `Maximum marks: ${row.maxMarks}` : "",
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, 20_000);
}
