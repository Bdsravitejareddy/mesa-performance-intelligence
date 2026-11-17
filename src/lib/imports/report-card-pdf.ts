import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Mesa's official term grade report (Nexus → Attendance & Grade → Grade → Report card), a one-page PDF. Read by text
// position, not as flowing text, because its component breakdown sits in two columns of small tables:
//   <Course title (may be cut short with "…")>  Weight  Marks  Max
//   <Component>                                  40%     30     40
//   Cumulative · Grade B+                                75.0   100
// Each course's weighted components are checked against its printed cumulative figure.

export type ReportComponent = { name: string; weightPct: number; marks: number; max: number };
export type ReportCourseBreakdown = {
  course: string; printedTitle: string; cumulative: number | null; grade: string; components: ReportComponent[];
  // Σ weight × marks / max, and whether it agrees with the printed cumulative (to its one decimal place).
  computed: number; agrees: boolean | null;
};
export type ReportOutClass = { name: string; score: number | null; outOf: number | null; grade: string; credits: number | null };
export type ParsedReportCard = { term: string; generatedOn: string | null; breakdown: ReportCourseBreakdown[]; outClass: ReportOutClass[] };
export type TextItem = { x: number; y: number; text: string };

const NUMBER = /^-?\d+(?:\.\d+)?$/;
const PERCENT = /^(\d+(?:\.\d+)?)%$/;
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
// The PDF is set with letter spacing, so its text comes out with stray spaces inside words and figures
// ("Cl ass Parti ci pati on", "2 2 .0", "Cumula tive · Gra d e A-"). Keywords and figures are compared without spaces.
const squash = (value: string) => value.replace(/\s+/g, "");
const isFigure = (value: string) => NUMBER.test(squash(value)) || PERCENT.test(squash(value));

// Words that appear in Mesa component names, used to rejoin a word the PDF's spacing split ("Assi gnment"). A run
// of fragments is joined only when every letter run in the result is one of these words; anything else is left as
// printed rather than guessed.
const VOCABULARY = new Set(`a an and the of for in on to with its by at
  assignment assignments assessment assessments class classroom participation session sessions mastery written writing
  exam exams examination term end mid mid-term end-term final weekly workbook workbooks quiz quizzes viva
  peer feedback group project projects presentation presentations pitch case study studies chatbot personal branding
  linkedin email report reflection essay test tests lab practical simulation problem set sets analysis research paper
  submission deliverable capstone interim review discussion journal portfolio demo hackathon debate role play
  contribution attendance homework module unit part section individual team cp mvp
  data driven decision making business frameworks reader crafting marketing strategies entrepreneurship fundamentals
  finance power communication art selling application cumulative grade course summary component breakdown result
  build your own byob prof`.split(/\s+/));

export function repairSpacing(text: string, extra: Set<string> = new Set()): string {
  // Closing punctuation split off by itself belongs to the fragment before it, opening punctuation to the one after.
  const tokens: string[] = [];
  for (const token of clean(text).split(" ").filter(Boolean)) {
    if (/^[)\]},.:;]+$/.test(token) && tokens.length) tokens[tokens.length - 1] += token;
    else if (tokens.length && /^[(\[{]+$/.test(tokens.at(-1)!)) tokens[tokens.length - 1] += token;
    else tokens.push(token);
  }
  // Fragments join only letter to letter: never across a separator, digit or bracket ("Case Study 1", "End-Term (Group").
  const joinable = (left: string, right: string) => /[A-Za-z]$/.test(left) && /^[A-Za-z]/.test(right);
  const known = (candidate: string) => {
    const runs = candidate.toLowerCase().match(/[a-z]+(?:-[a-z]+)?/g) ?? [];
    return runs.length > 0 && runs.every((run) => VOCABULARY.has(run) || extra.has(run) || run.split("-").every((part) => VOCABULARY.has(part) || extra.has(part)));
  };
  const out: string[] = [];
  for (let index = 0; index < tokens.length; ) {
    let taken = 1;
    // The longest run of fragments (up to six) that joins into known words.
    for (let length = Math.min(6, tokens.length - index); length > 1; length -= 1) {
      const run = tokens.slice(index, index + length);
      if (run.every((token, at) => at === 0 || joinable(run[at - 1], token)) && known(run.join(""))) { taken = length; break; }
    }
    out.push(tokens.slice(index, index + taken).join(""));
    index += taken;
  }
  return out.join(" ");
}

// Items on (almost) the same baseline form a line, read left to right; lines run top to bottom.
export function toLines(items: TextItem[], tolerance = 2.5): TextItem[][] {
  const sorted = items.filter((item) => clean(item.text)).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].y - item.y) <= tolerance) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function generatedOn(squashed: string): string | null {
  const match = /Generated(\d{1,2})([A-Za-z]{3})[a-z]*(\d{4})/i.exec(squashed);
  const month = match ? MONTHS.indexOf(match[2].toLowerCase()) : -1;
  return match && month >= 0 ? `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}` : null;
}

// Full course names from the course summary (whose names print cleanly), so a block title that is cut short or split
// ("T he Art o f Selling with Pro f . Ris ha b …") is named in full: the one course whose name, without spaces,
// starts with the title's.
function fullName(printed: string, names: string[]): string {
  const stem = squash(printed.replace(/\s*(…|\.\.\.)\s*$/, "")).toLowerCase();
  const matches = names.filter((name) => squash(name).toLowerCase().startsWith(stem));
  return matches.length === 1 ? matches[0] : repairSpacing(printed.replace(/\s*(…|\.\.\.)\s*$/, ""));
}

export function parseReportCardItems(items: TextItem[], pageWidth: number): ParsedReportCard {
  const lines = toLines(items);
  const flat = lines.map((line) => squash(line.map((item) => item.text).join("")));
  // "Term 1 · PGP Cohort IV" in the header, or the "Term  Term 1" field: the first line naming a term number.
  const termNumber = flat.map((text) => /Term(\d+)/i.exec(text)?.[1]).find(Boolean);
  const term = termNumber ? `Term ${termNumber}` : "";
  const startSummary = flat.findIndex((text) => /^coursesummary$/i.test(text));
  const startBreakdown = flat.findIndex((text) => /^componentbreakdown$/i.test(text));
  const startOut = flat.findIndex((text) => /^outclass$/i.test(text));
  const end = flat.findIndex((text) => /system-generatedreport/i.test(text));
  if (startBreakdown < 0) throw new Error("This PDF has no component breakdown; it may not be a Mesa grade report.");

  // Course summary rows begin with their row number: "1 | AI and its Application | In-class | 4.0 | 75.0 | B+ | 3.00".
  const names = (startSummary >= 0 ? lines.slice(startSummary + 1, startBreakdown) : []).map((line) => line.map((item) => clean(item.text)))
    .filter((words) => /^\d+$/.test(squash(words[0] ?? ""))).map((words) => {
      // The name runs up to the type column ("In-class"); without one, up to the first figure.
      const type = words.findIndex((word, index) => index > 0 && /^(In|Out)-class$/i.test(squash(word)));
      const stop = type > 0 ? type : words.findIndex((word, index) => index > 0 && isFigure(word));
      return clean(words.slice(1, stop > 0 ? stop : undefined).join(" "));
    })
    .filter(Boolean);
  // Words of the course names help rejoin split words in component names too.
  const courseWords = new Set(names.flatMap((name) => name.toLowerCase().match(/[a-z]+/g) ?? []));

  // Two columns of tables, each read top to bottom on its own. The split falls between the left table's "Max"
  // heading and the right table's title on a header line that holds both; else at the page's middle.
  const breakdownLines = lines.slice(startBreakdown + 1, startOut >= 0 ? startOut : end >= 0 ? end : lines.length);
  const isWord = (item: TextItem, word: string) => squash(item.text).toLowerCase() === word;
  const twinHeader = breakdownLines.find((line) => line.filter((item) => isWord(item, "weight")).length === 2);
  const leftMax = twinHeader?.find((item) => isWord(item, "max"));
  const rightTitle = leftMax && twinHeader?.find((item) => item.x > leftMax.x + 1);
  const middle = leftMax && rightTitle ? (leftMax.x + rightTitle.x) / 2 : pageWidth / 2;
  const breakdown: ReportCourseBreakdown[] = [];
  for (const side of [0, 1]) {
    let current: ReportCourseBreakdown | null = null;
    for (const line of breakdownLines) {
      const cells = line.filter((item) => (side === 0 ? item.x < middle : item.x >= middle));
      if (!cells.length) continue;
      const weightAt = cells.findIndex((item) => isWord(item, "weight"));
      if (weightAt >= 0 && cells.some((item) => isWord(item, "marks")) && cells.some((item) => isWord(item, "max"))) {
        const printedTitle = clean(cells.slice(0, weightAt).map((item) => item.text).join(" "));
        current = { course: fullName(printedTitle, names), printedTitle, cumulative: null, grade: "", components: [], computed: 0, agrees: null };
        breakdown.push(current);
        continue;
      }
      if (!current) continue;
      const labels = cells.filter((item) => !isFigure(item.text)).map((item) => clean(item.text));
      const figures = cells.filter((item) => isFigure(item.text)).map((item) => squash(item.text));
      const cumulative = /^Cumulative.*Grade([A-F][+-]?)$/i.exec(squash(labels.join("")));
      if (cumulative) { current.grade = cumulative[1].toUpperCase(); current.cumulative = NUMBER.test(figures[0] ?? "") ? Number(figures[0]) : null; continue; }
      const weight = PERCENT.exec(figures[0] ?? "");
      if (labels.length && weight && NUMBER.test(figures[1] ?? "") && NUMBER.test(figures[2] ?? "")) {
        current.components.push({ name: repairSpacing(labels.join(" "), courseWords), weightPct: Number(weight[1]), marks: Number(figures[1]), max: Number(figures[2]) });
      }
    }
  }
  for (const course of breakdown) {
    course.computed = Math.round(course.components.reduce((sum, item) => sum + (item.max > 0 ? item.weightPct * item.marks / item.max : 0), 0) * 100) / 100;
    course.agrees = course.cumulative === null || !course.components.length ? null : Math.abs(course.computed - course.cumulative) <= 0.051;
  }

  // Out-of-class programmes (e.g. BYOB): a name line, a header "Score (out of 10) | Grade | Credits", then the values.
  const outClass: ReportOutClass[] = [];
  if (startOut >= 0) {
    const outLines = lines.slice(startOut + 1, end >= 0 ? end : lines.length);
    for (let index = 0; index + 2 < outLines.length; index += 1) {
      const header = squash(outLines[index + 1].map((item) => item.text).join(""));
      if (!/score/i.test(header) || !/grade/i.test(header)) continue;
      const values = outLines[index + 2].map((item) => squash(item.text));
      const figures = values.filter((value) => NUMBER.test(value));
      outClass.push({
        name: repairSpacing(outLines[index].map((item) => item.text).join(" ")),
        score: figures.length >= 2 ? Number(figures[0]) : null,
        outOf: Number(/outof(\d+(?:\.\d+)?)/i.exec(header)?.[1] ?? NaN) || null,
        grade: values.find((value) => /^[A-F][+-]?$/.test(value)) ?? "",
        credits: figures.length ? Number(figures.at(-1)) : null,
      });
      index += 2;
    }
  }
  return { term, generatedOn: generatedOn(flat.join("")), breakdown, outClass };
}

export async function readReportCardPdf(bytes: Uint8Array): Promise<ParsedReportCard> {
  const task = getDocument({ data: bytes, verbosity: 0 });
  try {
    const document = await task.promise;
    if (document.numPages > 4) throw new Error("A Mesa grade report is one page; this PDF is longer.");
    const page = await document.getPage(1);
    const { width } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const item of content.items) if ("str" in item && item.str.trim()) items.push({ x: item.transform[4], y: item.transform[5], text: item.str });
    return parseReportCardItems(items, width);
  } finally {
    await task.destroy();
  }
}
