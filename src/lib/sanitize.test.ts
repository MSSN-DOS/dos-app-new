import { describe, expect, it } from "vitest";

import { sanitizeRichText } from "./sanitize";

/**
 * These cases are the contract of the module, not decoration. Rich text is
 * rendered with `dangerouslySetInnerHTML`, so every one of them is a way a
 * question body could have become executable.
 */
describe("sanitizeRichText", () => {
  it("returns an empty string for empty input", () => {
    expect(sanitizeRichText("")).toBe("");
  });

  it("keeps the formatting the toolbar can produce", () => {
    const html =
      '<p><strong>bold</strong> <em>it</em> <u>u</u> <s>s</s> <mark>m</mark> ' +
      "x<sub>2</sub> y<sup>3</sup></p><hr><blockquote>q</blockquote>" +
      "<ul><li>one</li></ul><ol><li>two</li></ol><pre><code>code()</code></pre>";

    expect(sanitizeRichText(html)).toBe(html);
  });

  it("keeps line breaks", () => {
    expect(sanitizeRichText("a<br>b")).toBe("a<br>b");
    expect(sanitizeRichText("a<br/>b")).toBe("a<br>b");
  });

  it("drops a script element and its contents", () => {
    expect(sanitizeRichText("<p>a</p><script>alert(1)</script>")).toBe("<p>a</p>");
  });

  it("drops a style element and its contents", () => {
    expect(sanitizeRichText("<style>body{display:none}</style><p>a</p>")).toBe("<p>a</p>");
  });

  it("drops iframes, objects, embeds and svg", () => {
    expect(
      sanitizeRichText(
        '<p>a</p><iframe src="https://evil.test"></iframe>' +
          '<object data="x"></object><embed src="x"><svg><script>alert(1)</script></svg>',
      ),
    ).toBe("<p>a</p>");
  });

  it("drops img entirely — an image is not part of the allowlist yet", () => {
    expect(sanitizeRichText('<img src="x" onerror="alert(1)">')).toBe("");
  });

  it("drops an unclosed dangerous element", () => {
    expect(sanitizeRichText('<p>a</p><iframe src="https://evil.test">')).toBe("<p>a</p>");
  });

  it("discards every attribute on an allowed tag", () => {
    expect(sanitizeRichText('<p onclick="alert(1)" class="x" id="y">a</p>')).toBe("<p>a</p>");
    expect(sanitizeRichText('<span style="color:red">a</span>')).toBe("<span>a</span>");
  });

  it("unwraps a disallowed tag but keeps its text", () => {
    expect(sanitizeRichText("<h1>Title</h1>")).toBe("Title");
    expect(sanitizeRichText("<table><tr><td>cell</td></tr></table>")).toBe("cell");
  });

  it("unwraps a link, so no href survives", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">click</a>')).toBe("click");
  });

  it("removes comments, including markup hidden inside them", () => {
    expect(sanitizeRichText("<!--<script>alert(1)</script>-->")).toBe("");
    expect(sanitizeRichText("<p>a<!-- hidden -->b</p>")).toBe("<p>ab</p>");
  });

  it("does not let a split tag reassemble into a script tag", () => {
    const out = sanitizeRichText("<scr<script>ipt>alert(1)</script>");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).not.toContain("</script");
  });

  it("keeps an inline math node with its LaTeX payload", () => {
    const html = '<p>x = <span data-type="inline-math" data-latex="\\frac{1}{2}"></span></p>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("keeps a block math node with its LaTeX payload", () => {
    const html = '<div data-type="block-math" data-latex="\\sum_{i=1}^{n} i"></div>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("strips a data-type that is not one of the two math nodes", () => {
    expect(sanitizeRichText('<span data-type="evil" data-latex="x"></span>')).toBe("<span></span>");
    expect(sanitizeRichText('<div data-type="inline-math" data-latex="x"></div>')).toBe("<div></div>");
  });

  it("drops a math node that carries no LaTeX payload", () => {
    expect(sanitizeRichText('<span data-type="inline-math"></span>')).toBe("<span></span>");
  });

  it("escapes a quote in the LaTeX payload so it cannot break out of the attribute", () => {
    const out = sanitizeRichText(
      `<span data-type="inline-math" data-latex='x" onmouseover="alert(1)'>`,
    );
    expect(out).toBe(
      '<span data-type="inline-math" data-latex="x&quot; onmouseover=&quot;alert(1)">',
    );
    expect(out).not.toContain('onmouseover="');
  });

  it("leaves an ampersand alone, because LaTeX alignment uses it", () => {
    const html = '<div data-type="block-math" data-latex="\\begin{matrix}a & b\\end{matrix}"></div>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("is idempotent", () => {
    const inputs = [
      "<p>plain</p>",
      '<p onclick="x">a</p><script>alert(1)</script>',
      '<span data-type="inline-math" data-latex="x^2"></span>',
      `<span data-type="inline-math" data-latex='a"b'>`,
      "<scr<script>ipt>",
      '<img src="x" onerror="alert(1)">',
    ];

    for (const input of inputs) {
      const once = sanitizeRichText(input);
      expect(sanitizeRichText(once)).toBe(once);
    }
  });
});
