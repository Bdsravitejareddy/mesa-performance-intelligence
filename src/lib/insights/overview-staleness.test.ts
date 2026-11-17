import { describe, expect, it } from "vitest";
import { newestProfileInput } from "./overview-brief";

// A client whose every query resolves to the rows given for its table.
function client(tables: Record<string, { at: string }[]>) {
  return { from(table: string) { const chain: Record<string, unknown> = {}; for (const method of ["select", "eq", "not", "order", "limit"]) chain[method] = () => chain; chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [] }).then(resolve); return chain; } };
}

describe("when the overview's inputs last changed", () => {
  it("is the newest of the questionnaire, imported results, behaviour analysis and AI skill view", async () => {
    const newest = await newestProfileInput(client({
      test_attempts: [{ at: "2026-10-23T05:16:10Z" }], external_assessments: [{ at: "2026-11-17T07:25:00Z" }],
      behaviour_analyses: [{ at: "2026-11-17T07:38:30Z" }], ai_skill_views: [{ at: "2026-11-16T04:00:00Z" }],
    }) as never);
    expect(newest).toBe("2026-11-17T07:38:30Z");
    expect(await newestProfileInput(client({}) as never)).toBeNull();
  });
});
