import { describe, expect, it } from "vitest";
import { assignmentDetailArguments, selectAssignmentReadTools, toolArgumentVariants } from "./tool-selection";

describe("Nexus MCP tool selection", () => {
  it("selects only documented plural read tools and excludes writes", () => {
    const selected = selectAssignmentReadTools([
      { name: "list_assignments", inputSchema: { type: "object", properties: {} } },
      { name: "list_grades", inputSchema: { type: "object", properties: {} } },
      { name: "get_course_grades", inputSchema: { type: "object", properties: {} } },
      { name: "get_grades", inputSchema: { type: "object", properties: {} } },
      { name: "submit_assignment", inputSchema: { type: "object", properties: {} } },
      { name: "grade_submission", inputSchema: { type: "object", properties: {} } },
      { name: "get_assignment", inputSchema: { type: "object", properties: { assignment_id: { type: "string" } }, required: ["assignment_id"] } },
    ]);
    expect(selected.map((tool) => tool.name)).toEqual(["list_assignments", "list_grades", "get_course_grades", "get_grades"]);
  });

  it("calls only tools that do not require unknown identifying arguments", () => {
    const selected = selectAssignmentReadTools([
      { name: "list_assignments", inputSchema: { type: "object", properties: { status: { type: "string" } } } },
      { name: "list_grades", inputSchema: { type: "object", properties: { course_id: { type: "string" } }, required: ["course_id"] } },
    ]);
    expect(selected.map((tool) => tool.name)).toEqual(["list_assignments"]);
  });

  it("covers the documented status enum instead of relying on a hidden default filter", () => {
    expect(toolArgumentVariants({ name: "list_assignments", inputSchema: { type: "object", properties: { status: { type: "string", enum: ["due", "submitted", "graded"] } } } })).toEqual([{ status: "due" }, { status: "submitted" }, { status: "graded" }]);
  });

  it("fills the known required assignment identifier for an exact read-only detail lookup", () => {
    expect(assignmentDetailArguments({
      name: "get_assignment",
      inputSchema: { type: "object", properties: { assignmentId: { type: "string" }, includeGrades: { type: "boolean", default: true } }, required: ["assignmentId"] },
    }, "assignment-1")).toEqual({ assignmentId: "assignment-1", includeGrades: true });
  });
});
