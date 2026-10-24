// Cohort 4 Quiz Tool results: a separately labelled source, read through the member's own browser. Summed on
// their own (distinct questions correct out of asked) and never added to official marks, averages or standing.
export type QuizToolRow = { course: string; term: string; session: string; correct: number; total: number; shown: string; missed: { question: string; yourAnswer: string; correctAnswer: string }[]; captured_at?: string };
export type QuizToolSummary = { correct: number; total: number; percent: number | null; sessions: number; courses: { course: string; correct: number; total: number; percent: number; sessions: number }[] };

const percent = (correct: number, total: number) => Math.round((correct / total) * 1000) / 10;

export function summariseQuizTool(rows: QuizToolRow[]): QuizToolSummary {
  const byCourse = new Map<string, { correct: number; total: number; sessions: number }>();
  for (const row of rows) {
    const entry = byCourse.get(row.course) ?? { correct: 0, total: 0, sessions: 0 };
    byCourse.set(row.course, { correct: entry.correct + row.correct, total: entry.total + row.total, sessions: entry.sessions + 1 });
  }
  const correct = rows.reduce((sum, row) => sum + row.correct, 0), total = rows.reduce((sum, row) => sum + row.total, 0);
  return { correct, total, percent: total ? percent(correct, total) : null, sessions: rows.length,
    courses: [...byCourse].map(([course, entry]) => ({ course, ...entry, percent: percent(entry.correct, entry.total) })).sort((a, b) => a.course.localeCompare(b.course)) };
}

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function parseQuizToolRow(body: Record<string, unknown>): QuizToolRow | { error: string } {
  const course = text(body.course, 120), session = text(body.session, 60), term = text(body.term, 40), shown = text(body.shown, 40);
  const correct = Number(body.correct), total = Number(body.total);
  if (!course || !session) return { error: "Enter the course and session." };
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total < 1 || correct < 0 || correct > total) return { error: "Enter correct and total as whole numbers, with correct no more than total." };
  const missed = (Array.isArray(body.missed) ? body.missed as Record<string, unknown>[] : []).slice(0, 50)
    .map((item) => ({ question: text(item.question, 300), yourAnswer: text(item.yourAnswer, 80), correctAnswer: text(item.correctAnswer, 80) }))
    .filter((item) => item.question);
  return { course, term, session, correct, total, shown, missed };
}
