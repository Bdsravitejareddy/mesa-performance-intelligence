import { describe, expect, it } from "vitest";
import { calibrate, corrected } from "./calibration";

describe("AI grade calibration", () => {
  it("reports bias and typical error but adjusts nothing with few pairs", () => {
    const calibration = calibrate([{ official: 51, ai: 77.5 }, { official: 60.2, ai: 80 }, { official: null, ai: 90 }]);
    expect(calibration).toMatchObject({ pairs: 2, bias: 23.2, mae: 23.2, within: 0, ready: false });
    expect(corrected(90, calibration)).toBeNull();
  });
  it("offers a bias-corrected range once there are enough pairs", () => {
    const calibration = calibrate([60, 70, 80, 65, 75].map((official) => ({ official, ai: official + 10 })));
    expect(calibration).toMatchObject({ pairs: 5, bias: 10, mae: 10, ready: true });
    expect(corrected(90, calibration)).toEqual({ value: 80, low: 70, high: 90 });
  });
});
