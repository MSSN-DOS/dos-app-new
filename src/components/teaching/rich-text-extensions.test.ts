import { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";

import { sanitizeRichText } from "@/lib/sanitize";
import { renderRichText } from "@/lib/rich-text";
import { richTextExtensions } from "./rich-text-extensions";

describe("science rich-text document round trip", () => {
  it("preserves formatting and both equation types after sanitizing and reopening", () => {
    const original = new Editor({
      extensions: richTextExtensions(),
      content:
        "<p><strong>Force</strong> x<sub>2</sub> <mark>note</mark></p><blockquote><p>Read carefully</p></blockquote><ol><li><p>First</p></li></ol>",
    });
    original.commands.insertInlineMath({ latex: "E = mc^2" });
    original.commands.insertBlockMath({ latex: "\\frac{1}{2}" });
    const stored = sanitizeRichText(original.getHTML());
    const reopened = new Editor({ extensions: richTextExtensions(), content: stored });
    const html = reopened.getHTML();
    expect(html).toContain('data-type="inline-math"');
    expect(html).toContain('data-type="block-math"');
    expect(html).toContain("<strong>Force</strong>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<mark>note</mark>");
    expect(html).toContain("<blockquote>");
    expect(renderRichText(html)).toContain('class="katex');
    original.destroy();
    reopened.destroy();
  });

  it("does not retain executable markup pasted into a document", () => {
    const editor = new Editor({
      extensions: richTextExtensions(),
      content:
        '<p onclick="alert(1)">Text</p><script>alert(1)</script><a href="javascript:alert(1)">link</a>',
    });
    const stored = sanitizeRichText(editor.getHTML());
    expect(stored).not.toContain("onclick");
    expect(stored).not.toContain("<script");
    expect(stored).not.toContain("javascript:");
    editor.destroy();
  });
});
