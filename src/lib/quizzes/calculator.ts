/** Arithmetic parser: no eval, Function constructor, or executable input. */
export function calculateQuizExpression(expression: string): number {
  const source = expression.replace(/\s/g, "").replaceAll("×", "*").replaceAll("÷", "/");
  const tokens = source.match(/\d*\.?\d+|[()+\-*/]/g) ?? [];
  if (!source || tokens.join("") !== source) throw new Error("Enter numbers and arithmetic operators");
  let index = 0;
  const primary = (): number => {
    const token = tokens[index++];
    if (token === "+") return primary();
    if (token === "-") return -primary();
    if (token === "(") { const value = sum(); if (tokens[index++] !== ")") throw new Error("Close the parentheses"); return value; }
    if (!token || !/^\d*\.?\d+$/.test(token)) throw new Error("Complete the expression");
    return Number(token);
  };
  const product = (): number => {
    let value = primary();
    while (tokens[index] === "*" || tokens[index] === "/") { const op = tokens[index++]; const right = primary(); if (op === "/" && right === 0) throw new Error("Cannot divide by zero"); value = op === "*" ? value * right : value / right; }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[index] === "+" || tokens[index] === "-") { const op = tokens[index++]; const right = product(); value = op === "+" ? value + right : value - right; }
    return value;
  };
  const value = sum();
  if (index !== tokens.length || !Number.isFinite(value)) throw new Error("Check the expression");
  return Number(value.toPrecision(12));
}
