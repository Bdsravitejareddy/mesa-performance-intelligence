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

// Attached materials (question paper, exhibits, rubric) that get_assignment documents as part of the assignment.
// Only files in Nexus's own storage path for this assignment are read; anything else stays a label.
export function attachedMaterialFiles(value: unknown, assignmentId: string): { name: string; url: string }[] {
  const row = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const prefix = `https://storage.googleapis.com/mesa_tech_assets/mesa-lms/assignments/${assignmentId}/materials/`;
  return (Array.isArray(row.materials) ? row.materials as Record<string, unknown>[] : []).flatMap((item) => {
    const url = typeof item.link === "string" ? item.link : "";
    const name = String(item.fileName ?? item.title ?? "material").slice(0, 200);
    return /^[0-9a-f-]{36}$/i.test(assignmentId) && url.startsWith(prefix) && !url.includes("..") && /\.(pdf|docx|pptx|xlsx)(\?|$)/i.test(url) ? [{ name, url }] : [];
  }).slice(0, 4);
}
