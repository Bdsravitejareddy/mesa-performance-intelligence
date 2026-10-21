export type RoleCompetency = {
  id: string;
  title: string;
  description: string;
  sourceQuote: string;
  evidenceKind: "responsibility" | "required" | "preferred";
};

export type CareerEvidence = {
  id: string;
  kind: "resume_statement" | "evaluation_finding" | "topic_competency" | "linked_submission";
  label: string;
  quote: string;
  sourceReference: string;
  competencies: string[];
  confidence: "high" | "medium" | "low" | "insufficient";
  accepted: boolean;
  polarity: "supports" | "contradicts";
  reviewStatus?: "suggested" | "accepted" | "dismissed";
};

export type RoleEvidenceState = "demonstrated" | "adjacent" | "unverified" | "development_needed";

export type RoleEvidenceFinding = {
  requirementId: string;
  competency: string;
  state: RoleEvidenceState;
  reviewStatus: "suggested" | "accepted" | "dismissed";
  evidenceIds: string[];
  evidenceQuotes: string[];
  evidenceKinds: CareerEvidence["kind"][];
  sourceLabels: string[];
  sourceReferences: string[];
  confidence: "high" | "medium" | "low" | "insufficient";
  nextAction: string;
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function isPhraseOnly(evidence: CareerEvidence): boolean {
  return evidence.kind === "resume_statement";
}

function confidenceFor(rows: CareerEvidence[]): RoleEvidenceFinding["confidence"] {
  if (rows.some((row) => row.confidence === "high")) return "high";
  if (rows.some((row) => row.confidence === "medium")) return "medium";
  if (rows.some((row) => row.confidence === "low")) return "low";
  return "insufficient";
}

export function mapRoleEvidence(requirements: RoleCompetency[], evidence: CareerEvidence[]): RoleEvidenceFinding[] {
  const uniqueEvidence = [...new Map(evidence.filter((item) => item.id && item.label && item.sourceReference).map((item) => [item.id, item])).values()];
  return requirements.map((requirement) => {
    const target = normalize(requirement.title);
    const related = uniqueEvidence.flatMap((item) => {
      const explicit = item.competencies.map(normalize).filter(Boolean);
      const exact = explicit.some((competency) => competency === target);
      const overlap = explicit.some((competency) => {
        const wanted = new Set(target.split(" ").filter((word) => word.length > 3));
        const shared = competency.split(" ").filter((word) => word.length > 3 && wanted.has(word));
        return shared.length > 0;
      });
      if (!exact && !overlap) return [];
      return [{ item, exact }];
    });

    const supports = related.filter(({ item }) => item.polarity === "supports");
    const conflicts = related.some(({ item }) => item.polarity === "contradicts") && supports.length > 0;
    const exactSupport = supports.filter(({ exact, item }) => exact && !isPhraseOnly(item));
    const hasStrongDemonstration = exactSupport.some(({ item }) => item.accepted && item.confidence === "high");
    const phraseEvidence = supports.filter(({ item }) => isPhraseOnly(item));
    const selected = related.map(({ item }) => item);

    let state: RoleEvidenceState;
    let nextAction: string;
    if (conflicts) {
      state = "adjacent";
      nextAction = "Review the conflicting evidence and add a dated work example before deciding whether this competency is demonstrated.";
    } else if (hasStrongDemonstration) {
      state = "demonstrated";
      nextAction = "Review the cited course or work evidence and accept it only if it demonstrates this requirement in context.";
    } else if (phraseEvidence.length && !exactSupport.length) {
      state = "unverified";
      nextAction = "Support this resume claim with a linked submission, accepted evaluation, or specific work example.";
    } else if (selected.length) {
      state = "adjacent";
      nextAction = "Add a specific work or course example that directly addresses this requirement.";
    } else {
      state = "development_needed";
      nextAction = "Gather relevant course or work evidence, or choose a practical project to build and demonstrate this skill.";
    }

    return {
      requirementId: requirement.id,
      competency: requirement.title,
      state,
      reviewStatus: "suggested",
      evidenceIds: selected.map(({ id }) => id),
      evidenceQuotes: selected.map(({ quote }) => quote),
      evidenceKinds: selected.map(({ kind }) => kind),
      sourceLabels: selected.map(({ label }) => label),
      sourceReferences: selected.map(({ sourceReference }) => sourceReference),
      confidence: confidenceFor(selected),
      nextAction,
    };
  });
}
