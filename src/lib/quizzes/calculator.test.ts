import { expect, it } from "vitest";
import { calculateQuizExpression } from "./calculator";
it("respects precedence, parentheses, decimals and unary minus", () => {
  expect(calculateQuizExpression("2 + 3 × 4")).toBe(14);
  expect(calculateQuizExpression("(2+3)÷4")).toBe(1.25);
  expect(calculateQuizExpression("-2*-3+.5")).toBe(6.5);
});
it("rejects executable input, incomplete expressions and division by zero", () => {
  for (const text of ["alert(1)", "1/0", "1+", "(1+2", "1..2"])
    expect(() => calculateQuizExpression(text)).toThrow();
});
