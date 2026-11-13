import { describe, expect, it } from "vitest";

import { renderRichText } from "./rich-text";

describe("renderRichText", () => {
  it("returns an empty string for empty input", () => {
    expect(renderRichText("")).toBe("");
  });

  it("passes plain markup through unchanged", () => {
    expect(renderRichText("<p><strong>a</strong></p>")).toBe("<p><strong>a</strong></p>");
  });

  it("renders an inline math node into KaTeX markup", () => {
    const out = renderRichText(
      '<p><span data-type="inline-math" data-latex="x^2"></span></p>',
    );
    expect(out).toContain('class="katex"');
    expect(out).not.toContain("data-type=\"inline-math\"");
  });

  it("renders a block math node in display mode", () => {
    const out = renderRichText('<div data-type="block-math" data-latex="\\sum_{i=1}^{n} i"></div>');
    expect(out).toContain("katex-display");
  });

  it("decodes the escaped angle brackets in the payload before rendering", () => {
    const out = renderRichText(
      '<span data-type="inline-math" data-latex="a &lt; b"></span>',
    );
    expect(out).toContain('class="katex"');
    expect(out).not.toContain("data-latex");
  });

  it("sanitises before rendering, so a script never reaches the output", () => {
    const out = renderRichText('<p>a</p><script>alert(1)</script>');
    expect(out).toBe("<p>a</p>");
  });

  it("still renders the math when the body also contains hostile markup", () => {
    const out = renderRichText(
      '<span data-type="inline-math" data-latex="x^2"></span><img src=x onerror="alert(1)">',
    );
    expect(out).toContain('class="katex"');
    expect(out).not.toContain("onerror");
  });

  it("does not throw on LaTeX KaTeX cannot parse", () => {
    expect(() =>
      renderRichText('<span data-type="inline-math" data-latex="\\frac{1}"></span>'),
    ).not.toThrow();
  });

  it("renders every math node in a body, not just the first", () => {
    const out = renderRichText(
      '<span data-type="inline-math" data-latex="a"></span>' +
        '<span data-type="inline-math" data-latex="b"></span>',
    );
    expect(out.match(/class="katex"/g)).toHaveLength(2);
  });
});
