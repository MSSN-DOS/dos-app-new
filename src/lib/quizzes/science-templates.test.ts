import { describe, expect, it } from "vitest";
import katex from "katex";
import "katex/contrib/mhchem";
import { scienceTemplates, templateLatex } from "./science-templates";
import { sanitizeRichText } from "@/lib/sanitize";
import { renderRichText } from "@/lib/rich-text";
import { sciencePalettes } from "./science-palettes";
describe("editable science templates", () => {
  it.each(scienceTemplates)("renders $id with valid slots", (template) => {
    const values = template.slots.map(() => "1");
    expect(() =>
      katex.renderToString(templateLatex(template.id, values), {
        trust: false,
        throwOnError: true,
      }),
    ).not.toThrow();
  });
  it("preserves editable metadata safely and idempotently across storage", () => {
    const html =
      '<span data-type="inline-math" data-latex="ignored" data-science-template="fraction" data-science-values="[&quot;a&amp;b&quot;,&quot;2&quot;]" onclick="alert(1)"></span>';
    const clean = sanitizeRichText(html);
    expect(clean).toContain('data-science-template="fraction"');
    expect(clean).not.toContain("onclick");
    expect(sanitizeRichText(clean)).toBe(clean);
    expect(renderRichText(clean)).toContain("katex");
    expect(renderRichText(clean)).not.toContain("data-science-values");
  });
  it("drops malformed metadata and renders requested mathematics and chemistry", () => {
    expect(
      sanitizeRichText(
        '<span data-type="inline-math" data-latex="x" data-science-template="fraction" data-science-values="{}"></span>',
      ),
    ).not.toContain("data-science");
    for (const formula of [
      String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`,
      String.raw`\ce{N2 + 3H2 <=>[Fe][450°C] 2NH3}`,
      ...Object.values(sciencePalettes).flatMap((items) =>
        items.map((item) => item.latex),
      ),
    ])
      expect(() =>
        katex.renderToString(formula, { trust: false, throwOnError: true }),
      ).not.toThrow();
  });
});
