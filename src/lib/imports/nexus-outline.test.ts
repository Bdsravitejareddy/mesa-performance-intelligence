import { describe, expect, it } from "vitest";
import { nexusCourseId, outlineDocument, outlineSheetId, sheetTabs, sheetText } from "./nexus-outline";

describe("Nexus course outlines", () => {
  it("accepts only Nexus course pages and Google Sheets links", () => {
    expect(nexusCourseId("https://students.mesaschool.co.in/student/lms/courses/f2395447-6636-4fec-a2dc-a776310e893f")).toBe("f2395447-6636-4fec-a2dc-a776310e893f");
    expect(nexusCourseId("https://evil.example/student/lms/courses/f2395447-6636-4fec-a2dc-a776310e893f")).toBeNull();
    expect(outlineSheetId("https://docs.google.com/spreadsheets/d/1DOzQsmtXAP9j5ShEHHepZxa95T4iyssl-88cLgf_LEU/edit?usp=sharing")).toBe("1DOzQsmtXAP9j5ShEHHepZxa95T4iyssl-88cLgf_LEU");
    expect(outlineSheetId("https://docs.google.com.evil.example/spreadsheets/d/1DOzQsmtXAP9j5ShEHHepZxa95T4iyssl-88cLgf_LEU")).toBeNull();
    expect(outlineSheetId("https://drive.google.com/file/d/1DOzQsmtXAP9j5ShEHHepZxa95T4iyssl-88cLgf_LEU")).toBeNull();
  });
  it("lists the sheet's tabs from its read-only view", () => {
    const html = 'items.push({name: "Mesa Outline Template", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/x\\/htmlview\\/sheet?headers\\x3dtrue&gid=0"});items.push({name: "Sheet2", pageUrl: "https:\\/\\/x?headers\\x3dtrue&gid=131210448"});';
    expect(sheetTabs(html)).toEqual([{ name: "Mesa Outline Template", gid: "0" }, { name: "Sheet2", gid: "131210448" }]);
  });
  it("reads rows as text, keeping line breaks and decoding entities", () => {
    const html = '<table><tr><th>1</th><td class="s1"></td><td>Course title</td><td colspan="4">Data &amp; Decisions</td></tr><tr><th>2</th><td>Outcomes</td><td>- Build &quot;flags&quot;<br>- Use <a href="#">XLOOKUP</a></td></tr><tr><td></td></tr></table>';
    expect(sheetText(html)).toBe('Course title | Data & Decisions\nOutcomes | - Build "flags"\n- Use XLOOKUP');
  });
  it("labels the stored document with its Nexus source and read date", () => {
    const text = outlineDocument({ course: "Data 102", nexusUrl: "https://students.mesaschool.co.in/student/lms/courses/a", sheetUrl: "https://docs.google.com/spreadsheets/d/b", readOn: "2026-10-24" }, [{ pageNumber: 1, tab: "Outline", text: "Session 1 | SQL" }]);
    expect(text).toContain("Source: Nexus course page https://students.mesaschool.co.in/student/lms/courses/a (Outlines tab)");
    expect(text).toContain("Read on 2026-10-24");
    expect(text).toContain("=== Page 1: Outline ===\nSession 1 | SQL");
  });
});
