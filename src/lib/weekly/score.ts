// Week arithmetic and points for the weekly plan. Deterministic and timezone-stable (weeks start Monday, UTC).
export const POINTS_PER_TASK = 10;
export const PERFECT_WEEK_BONUS = 25;

export function weekStart(date = new Date()): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (day.getUTCDay() + 6) % 7; // Monday = 0
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

export type WeekTotals = { week: string; done: number; total: number };

// Points for every week; a streak counts consecutive weeks (ending with the last finished one or this one)
// where at least four of five tasks were done.
export function progress(weeks: WeekTotals[], current: string) {
  const points = weeks.reduce((sum, week) => sum + week.done * POINTS_PER_TASK + (week.total >= 5 && week.done >= 5 ? PERFECT_WEEK_BONUS : 0), 0);
  const ordered = [...weeks].sort((a, b) => b.week.localeCompare(a.week));
  let streak = 0;
  let expected = current;
  for (const week of ordered) {
    if (week.week > expected) continue;
    if (week.week !== expected) break;
    const strong = week.done >= 4;
    if (!strong && week.week === current) { expected = shiftWeek(expected, -1); continue; }
    if (!strong) break;
    streak += 1;
    expected = shiftWeek(expected, -1);
  }
  const level = Math.floor(points / 100) + 1;
  return { points, streak, level, toNextLevel: 100 - (points % 100) };
}

export function shiftWeek(week: string, by: number): string {
  const date = new Date(`${week}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by * 7);
  return date.toISOString().slice(0, 10);
}
