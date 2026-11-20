export const scienceTemplates = [
  {
    id: "fraction",
    label: "Fraction",
    group: "math",
    pattern: "\\frac{%0%}{%1%}",
    slots: ["Numerator", "Denominator"],
  },
  {
    id: "root",
    label: "Square root",
    group: "math",
    pattern: "\\sqrt{%0%}",
    slots: ["Expression"],
  },
  {
    id: "nth-root",
    label: "Nth root",
    group: "math",
    pattern: "\\sqrt[%0%]{%1%}",
    slots: ["Index", "Expression"],
  },
  {
    id: "power",
    label: "Power",
    group: "math",
    pattern: "{%0%}^{%1%}",
    slots: ["Base", "Power"],
  },
  {
    id: "subscript",
    label: "Subscript",
    group: "math",
    pattern: "{%0%}_{%1%}",
    slots: ["Base", "Subscript"],
  },
  {
    id: "scripts",
    label: "Subscript and power",
    group: "math",
    pattern: "{%0%}_{%1%}^{%2%}",
    slots: ["Base", "Subscript", "Power"],
  },
  {
    id: "sum",
    label: "Sum",
    group: "math",
    pattern: "\\sum_{%0%}^{%1%}{%2%}",
    slots: ["Lower limit", "Upper limit", "Expression"],
  },
  {
    id: "product",
    label: "Product",
    group: "math",
    pattern: "\\prod_{%0%}^{%1%}{%2%}",
    slots: ["Lower limit", "Upper limit", "Expression"],
  },
  {
    id: "integral",
    label: "Integral",
    group: "math",
    pattern: "\\int_{%0%}^{%1%}{%2%}\\,d%3%",
    slots: ["Lower limit", "Upper limit", "Expression", "Variable"],
  },
  {
    id: "limit",
    label: "Limit",
    group: "math",
    pattern: "\\lim_{%0%}{%1%}",
    slots: ["Limit", "Expression"],
  },
  {
    id: "log",
    label: "Logarithm",
    group: "math",
    pattern: "\\log_{%0%}{%1%}",
    slots: ["Base", "Expression"],
  },
  {
    id: "absolute",
    label: "Absolute value",
    group: "math",
    pattern: "\\left|%0%\\right|",
    slots: ["Expression"],
  },
  {
    id: "brackets",
    label: "Brackets",
    group: "math",
    pattern: "\\left(%0%\\right)",
    slots: ["Expression"],
  },
  {
    id: "cases",
    label: "Cases",
    group: "math",
    pattern: "\\begin{cases}%0%&%1%\\\\%2%&%3%\\end{cases}",
    slots: ["Expression 1", "Condition 1", "Expression 2", "Condition 2"],
  },
  {
    id: "overline",
    label: "Overline",
    group: "math",
    pattern: "\\overline{%0%}",
    slots: ["Expression"],
  },
  {
    id: "matrix2",
    label: "2 × 2 matrix",
    group: "math",
    pattern: "\\begin{pmatrix}%0%&%1%\\\\%2%&%3%\\end{pmatrix}",
    slots: ["Row 1 column 1", "Row 1 column 2", "Row 2 column 1", "Row 2 column 2"],
  },
  {
    id: "matrix3",
    label: "3 × 3 matrix",
    group: "math",
    pattern: "\\begin{pmatrix}%0%&%1%&%2%\\\\%3%&%4%&%5%\\\\%6%&%7%&%8%\\end{pmatrix}",
    slots: ["a11", "a12", "a13", "a21", "a22", "a23", "a31", "a32", "a33"],
  },
  {
    id: "derivative",
    label: "Derivative",
    group: "physics",
    pattern: "\\frac{d%0%}{d%1%}",
    slots: ["Function", "Variable"],
  },
  {
    id: "binomial",
    label: "Binomial",
    group: "math",
    pattern: "\\binom{%0%}{%1%}",
    slots: ["n", "r"],
  },
  {
    id: "vector",
    label: "Vector",
    group: "physics",
    pattern: "\\vec{%0%}",
    slots: ["Vector"],
  },
  {
    id: "hat",
    label: "Unit vector",
    group: "physics",
    pattern: "\\hat{%0%}",
    slots: ["Vector"],
  },
  {
    id: "change",
    label: "Rate of change",
    group: "physics",
    pattern: "\\frac{\\Delta %0%}{\\Delta %1%}",
    slots: ["Quantity", "Variable"],
  },
  {
    id: "partial",
    label: "Partial derivative",
    group: "physics",
    pattern: "\\frac{\\partial %0%}{\\partial %1%}",
    slots: ["Function", "Variable"],
  },
  {
    id: "closed-integral",
    label: "Closed integral",
    group: "physics",
    pattern: "\\oint_{%0%}^{%1%}{%2%}",
    slots: ["Lower limit", "Upper limit", "Expression"],
  },
  {
    id: "scientific",
    label: "Scientific notation",
    group: "physics",
    pattern: "%0%\\times 10^{%1%}",
    slots: ["Coefficient", "Exponent"],
  },
  {
    id: "reaction",
    label: "Reaction",
    group: "chemistry",
    pattern: "\\ce{%0% ->[%1%][%2%] %3%}",
    slots: ["Reactants", "Above arrow", "Below arrow", "Products"],
  },
  {
    id: "equilibrium",
    label: "Equilibrium",
    group: "chemistry",
    pattern: "\\ce{%0% <=>[%1%][%2%] %3%}",
    slots: ["Reactants", "Catalyst", "Conditions", "Products"],
  },
  {
    id: "isotope",
    label: "Isotope",
    group: "chemistry",
    pattern: "{}^{%0%}_{%1%}\\mathrm{%2%}",
    slots: ["Mass number", "Atomic number", "Element"],
  },
  {
    id: "ion",
    label: "Ion charge",
    group: "chemistry",
    pattern: "\\mathrm{%0%}^{%1%}",
    slots: ["Formula", "Charge"],
  },
] as const;
export function templateLatex(id: string, values: readonly string[]): string {
  const template = scienceTemplates.find((item) => item.id === id);
  return template
    ? template.pattern.replace(
        /%(\d+)%/g,
        (_match, index: string) => values[Number(index)]?.trim() || "\\square",
      )
    : "";
}

/** Decode only the entities used by our serialized node attributes. */
export function decodeScienceAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function scienceTemplateValues(raw: string): string[] | null {
  try {
    const value: unknown = JSON.parse(decodeScienceAttribute(raw));
    return Array.isArray(value) &&
      value.length <= 9 &&
      value.every((slot: unknown) => typeof slot === "string" && slot.length <= 128)
      ? value
      : null;
  } catch {
    return null;
  }
}
