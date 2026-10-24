// How far the blind AI grader sits from official marks, from the submissions that have both. With few pairs the
// numbers are shown but nothing is adjusted; from MIN_PAIRS on, a bias-corrected estimate is offered beside the
// AI grade (never replacing it), with its typical error as the range.
export const MIN_PAIRS = 5;
export type Calibration = { pairs: number; bias: number | null; mae: number | null; within: number; ready: boolean };

export function calibrate(rows: { official: number | null; ai: number | null }[]): Calibration {
  const pairs = rows.filter((row) => row.official !== null && row.ai !== null).map((row) => row.ai! - row.official!);
  if (!pairs.length) return { pairs: 0, bias: null, mae: null, within: 0, ready: false };
  const round = (value: number) => Math.round(value * 10) / 10;
  return { pairs: pairs.length, bias: round(pairs.reduce((sum, gap) => sum + gap, 0) / pairs.length), mae: round(pairs.reduce((sum, gap) => sum + Math.abs(gap), 0) / pairs.length), within: pairs.filter((gap) => Math.abs(gap) <= 7.5).length, ready: pairs.length >= MIN_PAIRS };
}

export function corrected(ai: number | null, calibration: Calibration): { value: number; low: number; high: number } | null {
  if (ai === null || !calibration.ready || calibration.bias === null || calibration.mae === null) return null;
  const value = Math.max(0, Math.min(100, Math.round(ai - calibration.bias)));
  return { value, low: Math.max(0, Math.round(value - calibration.mae)), high: Math.min(100, Math.round(value + calibration.mae)) };
}
