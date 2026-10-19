import { describe, expect, it } from "vitest";
import { inspectSubmissionQuality } from "./quality";

describe("objective quality checks", () => {
  it("reports only observable structure and arithmetic checks", () => {
    const result = inspectSubmissionQuality("Summary\n\nThe result is 2 + 2 = 5.\n\nReferences\n[1] Course notes");
    expect(result.wordCount).toBe(11);
    expect(result.findings.some((finding) => finding.title === "Arithmetic mismatch")).toBe(true);
    expect(result.findings.some((finding) => finding.title === "Source markers found")).toBe(true);
  });

  it("does not claim to verify argument quality", () => {
    const result = inspectSubmissionQuality("A brief answer.");
    expect(result.scopeNote).toContain("cannot judge");
    expect(result.findings.some((finding) => finding.title === "No source markers found")).toBe(true);
  });
});
