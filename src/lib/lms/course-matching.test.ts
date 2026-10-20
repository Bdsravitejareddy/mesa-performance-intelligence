import { describe, expect, it } from "vitest";
import { matchingCourseId } from "./course-matching";

describe("LMS course identity matching", () => {
  it("will not link two distinct LMS courses with the same title to one local course", () => {
    const identities = new Map([[
      "course-row-1", { userId: "member-1", title: "Finance", lmsCourseId: "lms-course-1" },
    ]]);
    expect(matchingCourseId(["course-row-1"], identities, "lms-course-1")).toBe("course-row-1");
    expect(matchingCourseId(["course-row-1"], identities, "lms-course-2")).toBeUndefined();
  });

  it("links an unlinked local course only when the title match is unique", () => {
    const identities = new Map([[
      "course-row-1", { userId: "member-1", title: "Finance", lmsCourseId: null },
    ]]);
    expect(matchingCourseId(["course-row-1"], identities, "lms-course-1")).toBe("course-row-1");
    expect(matchingCourseId(["course-row-1", "course-row-2"], identities, "lms-course-1")).toBeUndefined();
  });
});
