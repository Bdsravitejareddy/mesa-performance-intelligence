import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readReportCardPdf, repairSpacing } from "./report-card-pdf";

// A synthetic grade report laid out like Mesa's (A4, course summary, two columns of component tables, Out Class).
// Every name and mark here is invented. Like the real file, its text carries stray spaces inside words and figures
// (the PDF is set with letter spacing), and block titles are cut short.
async function syntheticReport(options: { breakTotal?: boolean } = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const put = (text: string, x: number, y: number) => page.drawText(text, { x, y, size: 6.5, font });
  put("OFFICIAL GRADE REPORT", 420, 800); put("Term 1 · PGP Cohort IV", 410, 790);
  put("Co urse summary", 30, 700);
  put("#", 34, 690); put("Course", 45, 690); put("Type", 330, 690); put("Credits", 380, 690);
  const summary = [["1", "Pricing Strategy with Prof. Example"], ["2", "Entrepreneurship 101 with Someone"], ["3", "Statistics Lab with Prof. N ovak"]];
  summary.forEach(([number, name], index) => { const y = 680 - index * 9; put(number, 34, y); put(name, 45, y); put("I n-cl ass", 330, y); put("2.0", 385, y); });
  put("Co mpo ne nt bre akdo wn", 30, 640);
  // Left column x 32–300 (Weight 210, Marks 250, Max 285); right column x 310–565 (Weight 480, Marks 515, Max 548).
  const table = (left: boolean, top: number, title: string, rows: [string, string, string, string][], total: [string, string]) => {
    const [x, w, m, mx] = left ? [34, 210, 250, 285] : [312, 480, 515, 548];
    put(title, x, top); put("We ight", w, top); put("Marks", m, top); put("Max", mx, top);
    rows.forEach(([name, weight, marks, max], index) => { const y = top - 10 - index * 9; put(name, x, y); put(weight, w, y); put(marks, m, y); put(max, mx, y); });
    const y = top - 10 - rows.length * 9; put(`Cumula tive · Gra d e ${total[0]}`, x, y); put(total[1], m, y); put("100", mx, y);
  };
  table(true, 625, "Pri cing Stra tegy with Pro f . Exa …", [["Assi gnment | Case Study 1", "10%", "8", "10"], ["MI D Term", "3 0%", "2 1", "30"], ["EN D TERM", "60%", "45", "60"]], ["A-", options.breakTotal ? "9 0.0" : "7 4.0"]);
  table(false, 625, "Entrep reneurs hip 101 with Some…", [["End-Term (Group Proj ect+Vi va)", "100%", "2 0.5", "30"]], ["B+", "68.3"]);
  table(true, 570, "Sta tistics La b with Pro f . N…", [["Cl ass workbooks", "40%", "0", "70"], ["Qui z", "60%", "9", "10"]], ["B", "54.0"]);
  put("Out Class", 30, 520); put("BYO B (Build Yo ur O wn Bus ines s )", 34, 510);
  put("Score (out of 10)", 100, 500); put("Grade", 290, 500); put("Credits", 480, 500);
  put("7", 120, 490); put("B+", 295, 490); put("10", 485, 490);
  put("System-generated report.", 30, 60); put("Generated 16 Nov 2026", 470, 60);
  return new Uint8Array(await pdf.save());
}

describe("reading Mesa's grade report PDF", () => {
  it("reads every course's components, weights, marks and grade, in both columns", async () => {
    const report = await readReportCardPdf(await syntheticReport());
    expect(report.term).toBe("Term 1");
    expect(report.generatedOn).toBe("2026-11-16");
    expect(report.breakdown.map((course) => [course.course, course.grade, course.cumulative, course.components.length, course.agrees])).toEqual([
      ["Pricing Strategy with Prof. Example", "A-", 74, 3, true],
      ["Statistics Lab with Prof. N ovak", "B", 54, 2, true],
      // The title cut short with "…" is named in full from the course summary.
      ["Entrepreneurship 101 with Someone", "B+", 68.3, 1, true],
    ]);
    expect(report.breakdown[0].components.map((item) => item.name)).toEqual(["Assignment | Case Study 1", "MID Term", "END TERM"]);
    expect(report.breakdown[0].components[1]).toEqual({ name: "MID Term", weightPct: 30, marks: 21, max: 30 });
    expect(report.breakdown[2].components[0].name).toBe("End-Term (Group Project+Viva)");
    // A zero is a recorded mark, not a missing one.
    expect(report.breakdown[1].components[0]).toEqual({ name: "Class workbooks", weightPct: 40, marks: 0, max: 70 });
    expect(report.outClass).toEqual([{ name: "BYOB (Build Your Own Business)", score: 7, outOf: 10, grade: "B+", credits: 10 }]);
  });

  it("flags a course whose printed total does not follow from its components", async () => {
    const report = await readReportCardPdf(await syntheticReport({ breakTotal: true }));
    expect(report.breakdown[0]).toMatchObject({ cumulative: 90, computed: 74, agrees: false });
  });

  it("refuses a PDF that is not a grade report", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText("Lecture 3 slides", { x: 50, y: 700, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
    await expect(readReportCardPdf(new Uint8Array(await pdf.save()))).rejects.toThrow(/no component breakdown/);
  });

  it("rejoins words split by letter spacing only into known words, never across digits or separators", () => {
    expect(repairSpacing("Cl ass Parti ci pati on")).toBe("Class Participation");
    expect(repairSpacing("Personal Brandi ng - Li nkedI n")).toBe("Personal Branding - LinkedIn");
    expect(repairSpacing("Pi tch 1")).toBe("Pitch 1");
    expect(repairSpacing("Mi d Term Exam")).toBe("Mid Term Exam");
    // An unknown split is left as printed rather than guessed.
    expect(repairSpacing("Zy gote Lab")).toBe("Zy gote Lab");
  });
});
