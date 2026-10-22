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

describe("assigning course-less LMS assignments by title", async () => {
  const { suggestCourseForTitle, courseSubjectWords } = await import("./course-matching");
  const courses = [
    "AI and its Application", "Business Frameworks with Pranjal Bangani", "Business Reader with Suprad", "Crafting Marketing Strategies with Prof. Siddarth Menon",
    "Data Driven Decision Making with Prof. Vinay Sharma", "Entrepreneurship 101 with Abhishek", "Fundamentals of Finance with Prof. Narahari",
    "Personal Branding - LinkedIn with Ananya", "Power of Communication", "The Art of Selling with Prof. Rishabh Ladha",
  ].map((title, index) => ({ id: `c${index}`, title }));

  it("uses subject words, not instructors or filler", () => {
    expect(courseSubjectWords("Fundamentals of Finance with Prof. Narahari")).toEqual(["finance"]);
    expect(courseSubjectWords("The Art of Selling with Prof. Rishabh Ladha")).toEqual(["selling"]);
  });

  it("assigns only when one course is named", () => {
    expect(suggestCourseForTitle("Quiz 3 Entrepreneurship 101", courses)?.courseId).toBe("c5");
    expect(suggestCourseForTitle("LinkedIn Branding Reflection", courses)?.courseId).toBe("c7");
    expect(suggestCourseForTitle("Week 1 Assignment", courses)).toBeNull();
    // "Business" alone names two courses, so nothing is assigned.
    expect(suggestCourseForTitle("Business case write-up", courses)).toBeNull();
    expect(suggestCourseForTitle("Business Frameworks assignment", courses)?.courseId).toBe("c1");
  });
});
