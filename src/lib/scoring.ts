export type ArithmeticCheck = {
  expression: string;
  computed: number | null;
  reported: number;
  status: "correct" | "arithmetic_error" | "insufficient_information";
};

export function isValidOfficialMark(mark: number): boolean {
  return Number.isFinite(mark) && mark >= 0 && mark <= 100;
}

export function formatOfficialMark(mark: number): string {
  if (!isValidOfficialMark(mark)) {
    throw new RangeError("Official marks must be between 0 and 100.");
  }

  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(mark)}/100`;
}

/**
 * Verifies simple arithmetic statements written as `number operator number = number`.
 * It checks arithmetic only; it cannot determine whether the formula or method is valid.
 */
export function verifyArithmeticStatements(text: string): ArithmeticCheck[] {
  const equation = /(-?\d+(?:\.\d+)?)\s*([+\-*/×÷])\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)/g;
  const results: ArithmeticCheck[] = [];

  for (const match of text.matchAll(equation)) {
    const left = Number(match[1]);
    const operator = match[2];
    const right = Number(match[3]);
    const reported = Number(match[4]);
    let computed = Number.NaN;

    switch (operator) {
      case "+":
        computed = left + right;
        break;
      case "-":
        computed = left - right;
        break;
      case "*":
      case "×":
        computed = left * right;
        break;
      case "/":
      case "÷":
        computed = left / right;
        break;
    }

    if (!Number.isFinite(computed) || !Number.isFinite(reported)) {
      results.push({
        expression: `${match[1]} ${operator} ${match[3]}`,
        computed: null,
        reported,
        status: "insufficient_information",
      });
      continue;
    }

    const tolerance = Math.max(1, Math.abs(computed), Math.abs(reported)) * 1e-9;
    results.push({
      expression: `${match[1]} ${operator} ${match[3]}`,
      computed,
      reported,
      status: Math.abs(computed - reported) <= tolerance ? "correct" : "arithmetic_error",
    });
  }

  return results;
}
