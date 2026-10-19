export type DemoAssessment = {
  id: string;
  title: string;
  course: string;
  date: string;
  mark: number;
  format: string;
  trend: "up" | "down" | "steady";
};

export const demoData = {
  courses: [
    { id: "demo-strategy", code: "MKT 204", title: "Strategic Marketing", color: "mint", modules: 8, materials: 14 },
    { id: "demo-finance", code: "FIN 112", title: "Corporate Finance", color: "violet", modules: 6, materials: 9 },
    { id: "demo-analytics", code: "BA 306", title: "Business Analytics", color: "amber", modules: 7, materials: 11 },
  ],
  assessments: [
    { id: "a1", title: "Market entry analysis", course: "Strategic Marketing", date: "18 Oct 2026", mark: 88, format: "Case analysis", trend: "up" },
    { id: "a2", title: "Valuation model", course: "Corporate Finance", date: "14 Oct 2026", mark: 76, format: "Quantitative", trend: "down" },
    { id: "a3", title: "Customer segmentation", course: "Strategic Marketing", date: "09 Oct 2026", mark: 84, format: "Written report", trend: "steady" },
    { id: "a4", title: "Regression interpretation", course: "Business Analytics", date: "03 Oct 2026", mark: 81, format: "Quantitative", trend: "up" },
  ] satisfies DemoAssessment[],
  mastery: [
    { topic: "Customer segmentation", value: 88, state: "Demonstrated" },
    { topic: "Market sizing", value: 79, state: "Demonstrated" },
    { topic: "Valuation methods", value: 63, state: "Development needed" },
    { topic: "Regression analysis", value: 72, state: "Insufficient evidence" },
  ],
  focus: [
    { title: "Show the assumptions", detail: "State the denominator and time period before interpreting a ratio.", tag: "Quantitative" },
    { title: "Connect insight to action", detail: "Translate each finding into a specific business decision.", tag: "Application" },
    { title: "Strengthen source links", detail: "Support market claims with course or case evidence.", tag: "Evidence" },
  ],
  swot: [
    { category: "Strength", title: "Clear customer logic", description: "Recent case answers connect segment needs to positioning." },
    { category: "Development", title: "Financial assumptions", description: "Discount-rate and growth assumptions need clearer justification." },
    { category: "Opportunity", title: "Apply analysis to strategy", description: "Build on strong segmentation work in the market-entry assessment." },
    { category: "Risk", title: "Thin evidence base", description: "Several conclusions rely on a single source or unstated assumption." },
  ],
  correlations: [
    { label: "Conceptual reasoning", score: 86, count: 4 },
    { label: "Quantitative accuracy", score: 74, count: 3 },
    { label: "Evidence quality", score: 78, count: 5 },
    { label: "Business application", score: 82, count: 4 },
  ],
  qualityFindings: [
    { title: "Unsupported conclusion", text: "The forecast conclusion needs a source or a stated assumption.", level: "Review" },
    { title: "Unit inconsistency", text: "One table mixes monthly and annual figures.", level: "Check" },
    { title: "Strong structure", text: "The response follows a clear question → evidence → implication flow.", level: "Strength" },
  ],
};

export const demoMarkSeries = [
  { label: "Aug 24", value: 71 },
  { label: "Sep 02", value: 74 },
  { label: "Sep 11", value: 69 },
  { label: "Sep 19", value: 78 },
  { label: "Sep 28", value: 76 },
  { label: "Oct 03", value: 81 },
  { label: "Oct 09", value: 84 },
  { label: "Oct 18", value: 88 },
];
