import { describe, expect, it } from "vitest";
import { validateQuestions } from "./course-questions";

const refs = [{ key: "S1", pageId: "p", materialId: "m", label: "Pricing.pdf · slide 4", excerpt: "Contribution margin is price minus variable cost per unit; fixed costs do not change it.", sourceKind: "course" }];
const question = (overrides: Record<string, unknown>) => ({ kind: "trick", prompt: "A firm raises fixed costs by 20%. What happens to its contribution margin per unit?", options: ["Falls 20%", "Unchanged", "Rises", "Cannot say"], answer: 1, explanation: "Fixed costs do not enter contribution margin.", quote: "fixed costs do not change it", ref: "S1", ...overrides });

describe("course-grounded questions", () => {
  it("keeps a question only with a supporting quote found in the course excerpts", () => {
    const kept = validateQuestions({ questions: [question({}), question({ quote: "a quote that is nowhere in the course" })] }, refs);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ kind: "trick", answer: 1 });
    expect(kept[0].explanation).toMatch(/Source: Pricing\.pdf · slide 4/);
  });
  it("rejects malformed options and keys", () => {
    expect(validateQuestions({ questions: [question({ options: ["A", "A", "B", "C"] }), question({ answer: 4 }), question({ options: ["A", "B", "C"] })] }, refs)).toEqual([]);
  });
});
