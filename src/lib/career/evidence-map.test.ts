import { describe, expect, it } from "vitest";
import { mapRoleEvidence, type CareerEvidence, type RoleCompetency } from "./evidence-map";

const requirements: RoleCompetency[] = [
  { id: "clinical-discovery", title: "Clinical product discovery", description: "Lead discovery with clinicians", sourceQuote: "Lead clinical product discovery", evidenceKind: "required" },
  { id: "healthcare-integration", title: "Healthcare integrations", description: "Deliver healthcare integrations", sourceQuote: "Deliver healthcare integrations", evidenceKind: "required" },
  { id: "leadership", title: "Product leadership", description: "Lead product teams", sourceQuote: "Lead product teams", evidenceKind: "required" },
  { id: "unsupported", title: "Medical device regulation", description: "Own medical device regulatory strategy", sourceQuote: "Own regulatory strategy", evidenceKind: "preferred" },
];

const evidence: CareerEvidence[] = [
  { id: "eval-1", kind: "evaluation_finding", label: "Entrepreneurship evaluation · accepted", quote: "Interviewed four physicians and converted workflow pain into a tested opportunity.", sourceReference: "Evaluation E-1 · criterion: customer discovery", competencies: ["clinical product discovery"], confidence: "high", accepted: true, polarity: "supports" },
];

describe("mapRoleEvidence", () => {
  it("maps accepted course evidence to a reviewable candidate without accepting it automatically", () => {
    const [finding] = mapRoleEvidence(requirements.slice(0, 1), evidence);
    expect(finding).toMatchObject({ requirementId: "clinical-discovery", state: "demonstrated", reviewStatus: "suggested", evidenceIds: ["eval-1"], sourceLabels: ["Entrepreneurship evaluation · accepted"], confidence: "high" });
    expect(finding.evidenceQuotes).toEqual([evidence[0].quote]);
    expect(finding.nextAction).toMatch(/review/i);
  });

  it("labels related course evidence as adjacent when it does not establish the requested skill", () => {
    const [finding] = mapRoleEvidence(requirements.slice(1, 2), [{ ...evidence[0], id: "eval-adjacent", competencies: ["healthcare product delivery"], accepted: true }]);
    expect(finding.state).toBe("adjacent");
    expect(finding.evidenceIds).toEqual(["eval-adjacent"]);
  });

  it("keeps a matching resume phrase unverified without work or course evidence", () => {
    const [finding] = mapRoleEvidence(requirements.slice(2, 3), [{ id: "resume-1", kind: "resume_statement", label: "Resume · experience", quote: "Led product teams across multiple launches.", sourceReference: "Resume · experience section", competencies: ["product leadership"], confidence: "low", accepted: false, polarity: "supports" }]);
    expect(finding.state).toBe("unverified");
    expect(finding.reviewStatus).toBe("suggested");
    expect(finding.evidenceIds).toEqual(["resume-1"]);
    expect(finding.nextAction).toMatch(/work example|submission|evidence/i);
  });

  it("marks an unsupported requirement as development needed", () => {
    const finding = mapRoleEvidence(requirements.slice(3), evidence)[0];
    expect(finding).toMatchObject({ state: "development_needed", reviewStatus: "suggested", evidenceIds: [], confidence: "insufficient" });
  });

  it("does not treat conflicting evidence as demonstrated", () => {
    const rows = [
      { ...evidence[0], id: "positive", competencies: ["product leadership"] },
      { ...evidence[0], id: "negative", competencies: ["product leadership"], polarity: "contradicts" as const },
    ];
    const [finding] = mapRoleEvidence(requirements.slice(2, 3), rows);
    expect(finding.state).toBe("adjacent");
    expect(finding.evidenceIds).toEqual(["positive", "negative"]);
    expect(finding.nextAction).toMatch(/conflict/i);
  });

  it("returns development needed with explicit missing-evidence action when no evidence exists", () => {
    const findings = mapRoleEvidence(requirements, []);
    expect(findings).toHaveLength(requirements.length);
    expect(findings.every((finding) => finding.state === "development_needed" && finding.reviewStatus === "suggested" && finding.evidenceIds.length === 0)).toBe(true);
  });

  it("preserves provenance and never upgrades an AI suggestion from its submitted state", () => {
    const [finding] = mapRoleEvidence(requirements.slice(0, 1), [{ ...evidence[0], accepted: false, reviewStatus: "accepted" } as CareerEvidence]);
    expect(finding.reviewStatus).toBe("suggested");
    expect(finding.sourceLabels[0]).toContain("accepted");
  });
});
