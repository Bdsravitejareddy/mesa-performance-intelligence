import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RoleProfileForm } from "./role-profile-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

describe("role benchmark form", () => {
  it("starts with the selected target and separates discovery from reviewed benchmark saving", () => {
    const markup = renderToStaticMarkup(createElement(RoleProfileForm));
    expect(markup).toContain("Senior Technical Product Manager — HealthTech/Healthcare — Singapore");
    expect(markup).toContain("Find public roles");
    expect(markup).toContain("Review fetched role source");
    expect(markup).toContain("Requirements you reviewed (one per line)");
    expect(markup).toContain("LinkedIn results are not imported");
    expect(markup).toContain("Unverified profiles are not used as benchmarks");
  });
});
