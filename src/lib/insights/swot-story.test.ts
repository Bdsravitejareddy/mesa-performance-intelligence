import { describe, expect, it } from "vitest";
import type { CompetencyAssessment, EvidenceRow } from "@/lib/competency/classify";
import type { RoleReadiness } from "@/lib/roles/readiness";
import { buildSwotStory, fallbackStandsOut, startHere, type StoryClaim, type StoryCompetency } from "./swot-story";
import { checkCard, checkStandsOut } from "./swot-narrative";

const row = (title: string, mark: number, band: EvidenceRow["band"], extra: Partial<EvidenceRow> = {}): EvidenceRow => ({ submissionId: title, assessmentId: title, assessmentTitle: title, course: "Art of Selling", mark, feedback: "", date: "2026-10-01", source: "Mesa LMS", mappingSource: "official_rubric", granularity: "whole_assessment", evidenceKind: "official", stakes: "graded", band, ...extra });
const competency = (id: string, name: string, state: CompetencyAssessment["state"], evidence: EvidenceRow[], confidence: CompetencyAssessment["confidence"] = "medium"): StoryCompetency => ({ id, name, domain: "D", mappedAssessments: evidence.length, assessment: { state, confidence, headline: name, why: { evidence, counted: evidence.filter((row) => row.band !== "unscored"), benchmark: "", interpretation: "", limitations: [], wouldChangeThis: "" } } });
const role = (name: string, competencies: string[], eligibility: string[] = []) => ({ role: { name, tier: "primary", competencies, key: name, postings: [] }, eligibility: eligibility.map((quote) => ({ quote })) }) as unknown as RoleReadiness;
const claim = (text: string, competencyId: string, claimType = "achievement"): StoryClaim => ({ claim: text, competencyId, claimType, fromKind: "resume", supportedByKind: null, status: "attested" });

const inputs = () => ({
  competencies: [
    competency("communication.persuasion", "Persuasion", "emerging", [row("Selling Mid-Term", 92, "high")]),
    competency("business.strategy", "Strategy", "conflicting", [row("Strategy Essay", 88, "high", { course: "Strategy 101" }), row("Strategy Case", 58, "low", { course: "Strategy 101" })]),
    competency("execution.operations", "Operations", "conflicting", [row("Rapido Workbook", 91, "high", { evidenceKind: "ai_grade" }), row("Swiggy Async", 52, "low", { evidenceKind: "ai_grade" })], "low"),
    competency("technical.sql", "SQL", "insufficient_evidence", []),
    competency("product.prioritisation", "Product prioritisation", "insufficient_evidence", [row("Backlog quiz", 50, "low")]),
    competency("analytical.structured_problem_solving", "Structured problem-solving", "insufficient_evidence", []),
  ],
  readiness: [role("Technical Product Manager", ["technical.sql", "product.prioritisation", "business.strategy"], ["5+ years of product experience"])],
  claims: [claim("Led Six Sigma projects saving £100k", "analytical.structured_problem_solving"), claim("Identified process gaps with as-is/to-be models", "analytical.structured_problem_solving"), claim("MSc in Business Analytics", "technical.sql", "credential")],
  criterionGaps: [],
  coverage: { assessments: 45, officialMarks: 5 },
  dataQuality: { syncWarning: null, heldAssignments: 0 },
});

describe("SWOT story findings", () => {
  const findings = buildSwotStory(inputs());
  const byKey = (key: string) => findings.find((finding) => finding.key === key);

  it("treats one strong official result as a promising sign to build on, not a strength, scoped to its course", () => {
    const sales = byKey("opportunity:promising:communication.persuasion")!;
    expect(sales.category).toBe("opportunity");
    expect(sales.headline).toMatch(/not yet a strength/);
    expect(sales.body).toContain("92");
    expect(sales.body).toContain("Art of Selling");
    expect(sales.body).not.toMatch(/career|personality|ready/i);
    expect(sales.evidence[0]).toMatchObject({ class: "official" });
  });

  it("never counts a CV claim as a strength or as independent corroboration, and labels qualifications as context", () => {
    expect(findings.filter((finding) => finding.category === "strength").every((finding) => finding.aiOnly || finding.evidence.some((item) => item.class === "official"))).toBe(true);
    const cv = byKey("opportunity:cv:analytical.structured_problem_solving")!;
    expect(cv.category).toBe("opportunity");
    expect(cv.evidence.every((item) => item.class === "self_reported")).toBe(true);
    expect(cv.body).toMatch(/your own account/);
    const unassessed = byKey("opportunity:unassessed")!;
    expect(unassessed.evidence.find((item) => item.label === "SQL")?.detail).toMatch(/no marked evidence/);
  });

  it("explains conflicting evidence plainly instead of averaging, and keeps AI-only conflicts unofficial", () => {
    const strategy = byKey("opportunity:conflict:business.strategy")!;
    expect(strategy.body).toMatch(/88.*58/);
    expect(strategy.body).toMatch(/average would hide/i);
    const operations = byKey("opportunity:conflict:execution.operations")!;
    expect(operations.body).toMatch(/AI estimates/);
    expect(operations.body).toMatch(/not a weakness/);
    expect(operations.priority).toBeLessThan(strategy.priority);
  });

  it("never turns missing evidence or a single low result into a weakness", () => {
    const weaknessSubjects = findings.filter((finding) => finding.category === "weakness").map((finding) => finding.subject);
    expect(weaknessSubjects).not.toContain("SQL");
    expect(weaknessSubjects).not.toContain("Product prioritisation");
    expect(byKey("opportunity:unassessed")!.body).toMatch(/not a weakness/);
  });

  it("uses each competency once, adds coverage and eligibility threats, and picks one place to start", () => {
    const subjects = findings.filter((finding) => finding.kind !== "unassessed_role_skills").map((finding) => finding.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
    expect(byKey("threat:coverage")!.body).toContain("5 of your 45");
    expect(byKey("threat:eligibility")!.body).toContain("5 years");
    expect(startHere(findings)?.action).toBeTruthy();
    const lead = fallbackStandsOut(findings);
    expect(lead).toMatch(/persuasion/i);
    expect(lead).toMatch(/main tension is strategy/);
    expect(lead.split(/\s+/).length).toBeLessThan(95);
  });

  it("merges conflicts that share one low assessment into a single finding about that work", () => {
    const shared = row("Venture Mid-Term", 51, "low", { course: "Entrepreneurship 101 with Abhishek" });
    const merged = buildSwotStory({ ...inputs(), competencies: [
      competency("business.strategy", "Strategy", "conflicting", [row("Marketing Strategy Essay", 90, "high"), shared]),
      competency("product.customer_needs", "Customer needs", "conflicting", [row("Selling Mid-Term", 92, "high"), shared]),
    ] }).filter((finding) => finding.kind === "conflict");
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toMatch(/strategy and customer needs/);
    expect(merged[0].body).toMatch(/more likely points to that assessment/);
    expect(merged[0].subject).toBe("Entrepreneurship 101");
  });

  it("calls a mostly strong record with one outlier mostly strong, but keeps it out of Strengths as the Skills page counts it mixed", () => {
    const mostly = buildSwotStory({ ...inputs(), competencies: [competency("business.strategy", "Strategy", "conflicting", [row("A", 92, "high"), row("B", 90, "high"), row("C", 88, "high"), row("D", 60, "low")], "high")] });
    expect(mostly[0]).toMatchObject({ category: "opportunity", kind: "mostly_strong" });
    expect(mostly[0].action).toContain("D");
  });
});

describe("SWOT agrees with the Skills page", () => {
  const states: CompetencyAssessment["state"][] = ["demonstrated_strength", "development_area", "emerging", "conflicting", "meets_expectations", "insufficient_evidence"];
  const ai = { evidenceKind: "ai_grade" as const };
  const all = [
    competency("product.metrics", "Product metrics", "demonstrated_strength", [row("Metrics A", 90, "high", ai), row("Metrics B", 88, "high", ai)], "low"),
    competency("communication.persuasion", "Persuasion", "emerging", [row("Selling Mid-Term", 92, "high")]),
    competency("learning.knowledge_transfer", "Knowledge transfer", "development_area", [row("Transfer A", 50, "low", ai), row("Transfer B", 55, "low", ai)], "low"),
    competency("business.strategy", "Strategy", "demonstrated_strength", [row("Strategy Essay", 90, "high"), row("Strategy Case", 88, "high")]),
    competency("execution.operations", "Operations", "insufficient_evidence", [row("Ops", 70, "middle")], "low"),
    competency("technical.python", "Python", "insufficient_evidence", []),
  ];
  const findings = buildSwotStory({ ...inputs(), competencies: all, readiness: [role("Forward Deployed Engineer", ["technical.python", "execution.operations"])], projectLanguages: [{ name: "Python", projects: 11 }] });
  const stateOf = new Map(all.map((item) => [item.id, item.assessment.state]));

  it("lists as Strengths exactly the demonstrated strengths, and as Weaknesses exactly the development areas", () => {
    const strengths = findings.filter((finding) => finding.category === "strength").map((finding) => finding.competencyId);
    const weaknesses = findings.filter((finding) => finding.category === "weakness").map((finding) => finding.competencyId);
    expect(strengths.sort()).toEqual(all.filter((item) => item.assessment.state === "demonstrated_strength").map((item) => item.id).sort());
    expect(weaknesses).toEqual(["learning.knowledge_transfer"]);
    for (const state of states.filter((value) => value !== "demonstrated_strength")) expect(strengths.some((id) => stateOf.get(id!) === state)).toBe(false);
  });

  it("labels a strength or weakness that rests only on AI grades", () => {
    const metrics = findings.find((finding) => finding.competencyId === "product.metrics")!;
    expect(metrics).toMatchObject({ category: "strength", aiOnly: true });
    expect(metrics.headline).toMatch(/AI grading only/);
    expect(findings.find((finding) => finding.competencyId === "learning.knowledge_transfer")!.headline).toMatch(/AI grading only/);
    expect(findings.find((finding) => finding.competencyId === "business.strategy")!.aiOnly).toBe(false);
  });

  it("mentions GitHub project use beside an unassessed skill without calling it a mark", () => {
    const unassessed = findings.find((finding) => finding.key === "opportunity:unassessed")!;
    expect(unassessed.body).toContain("11 of your GitHub projects use Python (project work, not a mark)");
    expect(unassessed.evidence.find((item) => item.label === "Python")!.detail).toMatch(/no marked evidence yet; 11 of your GitHub projects/);
    expect(unassessed.evidence.find((item) => item.label === "Operations")!.detail).toMatch(/one result so far/);
    expect(unassessed.numbers).toContain(11);
  });
});

describe("AI rewrite checks", () => {
  const findings = buildSwotStory(inputs());
  const sales = findings.find((finding) => finding.kind === "promising")!;
  const operations = findings.find((finding) => finding.key === "opportunity:conflict:execution.operations")!;
  const good = { headline: "Sales is a promising strength.", body: "Your official Selling mark of 92 is a strong result in this course. A negotiation or role-play example would help show how that translates into practice beyond one assessment.", action: "Next: add one example explaining how you handled an objection and what happened." };

  it("keeps a grounded card", () => expect(checkCard(sales, good)).toMatchObject({ headline: good.headline }));
  it("rejects invented figures", () => expect(checkCard(sales, { ...good, body: good.body.replace("92", "95") })).toBeNull());
  it("rejects banned template phrases", () => expect(checkCard(sales, { ...good, headline: "Turn emerging persuasion into a demonstrated strength" })).toBeNull());
  it("checks spelled-out figures, but not exercise sizes", () => {
    expect(checkCard(sales, { ...good, body: `${good.body} Nine other skills are untested.` })).toBeNull();
    expect(checkCard(sales, { ...good, action: "Next: record a five-minute pitch and collect two pieces of structured feedback." })).not.toBeNull();
  });
  it("rejects claims of improvement", () => expect(checkCard(sales, { ...good, body: `${good.body} You have improved steadily.` })).toBeNull());
  it("never lets an AI-only finding be called official", () => {
    expect(checkCard(operations, { headline: "Operations results are split.", body: "Your official marks rate one piece at 91 and one at 52, so this is an open question for now and worth settling with one task.", action: "Next: map one process as-is and to-be." })).toBeNull();
    expect(checkCard(operations, { headline: "The AI's read on operations is split.", body: "AI estimates put one piece of your work at 91 and another at 52, with no official mark to settle it, so treat it as an open question.", action: "Next: map one process as-is and to-be, with one metric to improve." })).not.toBeNull();
  });
  it("checks the opening paragraph's length and figures", () => {
    expect(checkStandsOut("Too short.", findings)).toBeNull();
    const text = "Your clearest strength so far is persuasion: an official mark of 92 in Selling stands out. Strategy is less settled, with 88 on one task and 58 on another, which points to the kind of task rather than the skill. Only 5 of 45 assessments have a released mark, so hold these readings loosely. Your next step is to test SQL, which your target role needs and nothing has measured yet.";
    expect(checkStandsOut(text, findings)).toBe(text);
    expect(checkStandsOut(text.replace("92", "97"), findings)).toBeNull();
  });
});
