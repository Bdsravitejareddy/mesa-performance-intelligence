import { describe, expect, it } from "vitest";
import { relatedCourseIds, suggestCourseLinks } from "./links";

const lms = [
  "AI and its Application", "Business Frameworks with Pranjal Bangani", "Business Reader with Suprad", "Crafting Marketing Strategies with Prof. Siddarth Menon",
  "Data Driven Decision Making with Prof. Vinay Sharma", "Entrepreneurship 101 with Abhishek", "Fundamentals of Finance with Prof. Narahari",
  "Personal Branding - LinkedIn with Ananya", "Power of Communication", "The Art of Selling with Prof. Rishabh Ladha",
].map((title, index) => ({ id: `lms${index}`, title }));
const drive = ["mesasem1ai", "mesasem1artofselling", "mesasem1businessframeworks", "mesasem1businessreader", "mesasem1data", "mesasem1entrepreneurship101", "mesasem1finance", "mesasem1marketing", "mesasem1powerofcommunication"].map((title, index) => ({ id: `drive${index}`, title }));

describe("course link suggestions", () => {
  it("pairs each Mesa Drive folder with exactly one LMS course", () => {
    const pairs = Object.fromEntries(suggestCourseLinks(drive, lms).map((item) => [item.materialCourse.title, item.assessmentCourse.title]));
    expect(pairs).toEqual({
      mesasem1ai: "AI and its Application",
      mesasem1artofselling: "The Art of Selling with Prof. Rishabh Ladha",
      mesasem1businessframeworks: "Business Frameworks with Pranjal Bangani",
      mesasem1businessreader: "Business Reader with Suprad",
      mesasem1data: "Data Driven Decision Making with Prof. Vinay Sharma",
      mesasem1entrepreneurship101: "Entrepreneurship 101 with Abhishek",
      mesasem1finance: "Fundamentals of Finance with Prof. Narahari",
      mesasem1marketing: "Crafting Marketing Strategies with Prof. Siddarth Menon",
      mesasem1powerofcommunication: "Power of Communication",
    });
  });

  it("does not match partial words or instructor names", () => {
    expect(suggestCourseLinks([{ id: "x", title: "mesasem1strat" }], lms)).toEqual([]);
    expect(suggestCourseLinks([{ id: "x", title: "mesasem1narahari" }], lms)).toEqual([]);
  });

  it("gives no suggestion when the name is ambiguous", () => {
    expect(suggestCourseLinks([{ id: "x", title: "mesasem1business" }], lms)).toEqual([]);
  });
});

describe("related courses", () => {
  const links = [{ assessment_course_id: "lms", material_course_id: "d1" }, { assessment_course_id: "lms", material_course_id: "d2" }, { assessment_course_id: "other", material_course_id: "d3" }];
  it("includes linked material courses for an assessment course", () => {
    expect(relatedCourseIds("lms", links).sort()).toEqual(["d1", "d2", "lms"]);
  });
  it("includes the assessment course and siblings for a material course", () => {
    expect(relatedCourseIds("d1", links).sort()).toEqual(["d1", "d2", "lms"]);
  });
  it("returns only itself when unlinked", () => {
    expect(relatedCourseIds("solo", links)).toEqual(["solo"]);
  });
});
