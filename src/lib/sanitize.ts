/**
 * Dependency-free HTML sanitizer for rich-text bodies.
 *
 * Rich text is authored in the Tiptap editor and rendered to students with
 * `dangerouslySetInnerHTML`, so this function is a boundary, not a formatting
 * helper: whatever survives here is markup we are willing to put inside a page.
 *
 * Strategy — strip, then rebuild:
 *
 *   1. Remove elements whose *contents* must never survive (script, style,
 *      iframe, svg, MathML, …) and drop comments/CDATA.
 *   2. Rewrite every remaining tag against a tag allowlist. A tag that is not
 *      allowed loses the tag and keeps its text.
 *   3. Re-emit **no** attribute except the two hand-written ones on a math node.
 *
 * Step 3 is the part that matters. Attributes are discarded rather than
 * filtered, so `onerror=`, `style=`, `src=` and every future attribute are
 * rejected by construction instead of by an ever-growing blocklist. Nothing
 * allowed here can hold a URL, so there is no `javascript:`/`data:` surface
 * left to defend.
 *
 * Limitation worth knowing: this is a tokenizer over tag-shaped text, not a
 * real HTML parser. It is deliberately biased towards throwing markup away
 * (over-escaping `<`, over-stripping) rather than preserving it, and it runs to
 * a fixed point so removing a tag cannot splice a forbidden tag back together
 * (`<scr<script>ipt>`). If this ever needs to accept untrusted HTML that must
 * round-trip faithfully, replace it with `sanitize-html`/DOMPurify rather than
 * growing this file.
 */

/** Elements whose contents are dropped entirely, not just un-tagged. */
const CONTENT_DROPPING_TAGS = [
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "template",
  "noscript",
  "title",
  "textarea",
  "svg",
  "math",
  "base",
  "meta",
  "link",
];

/** Tags that survive, matching what the editor toolbar can actually produce. */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "mark",
  "sub",
  "sup",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "span",
  "div",
]);

/** Tags with no closing form. */
const VOID_TAGS = new Set(["br", "hr"]);

/**
 * The only tags allowed to carry data, and the exact `data-type` they must
 * carry for it. `@tiptap/extension-mathematics` serialises an atom node as
 * `<span data-type="inline-math" data-latex="…"></span>`; the payload is the
 * LaTeX source, re-rendered by KaTeX at display time rather than trusted as
 * markup.
 */
const MATH_TAGS: Record<string, string> = {
  span: "inline-math",
  div: "block-math",
};

const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

function stripContentDroppingTags(html: string): string {
  let out = html;
  for (const tag of CONTENT_DROPPING_TAGS) {
    const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    let next = out.replace(pattern, "");
    // A self-closing or unclosed variant (`<iframe … />`) has no closing tag to
    // pair with, so the scoped pass above cannot reach it.
    const lone = new RegExp(`<${tag}(?:\\s[^>]*)?\\/?>`, "gi");
    next = next.replace(lone, "");
    while (next !== out) {
      out = next;
      next = out.replace(pattern, "").replace(lone, "");
    }
  }
  return out;
}

function readAttribute(raw: string, name: string): string | null {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = pattern.exec(raw);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

function escapeAttributeValue(value: string): string {
  // `&` is left alone on purpose: LaTeX alignment uses it, and it cannot break
  // out of a quoted attribute once `"` and `<`/`>` are gone. Leaving it also
  // keeps the function idempotent — re-running never double-escapes.
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function keepAttributes(tag: string, raw: string): string {
  const mathType = MATH_TAGS[tag];
  if (!mathType) return "";

  const declared = readAttribute(raw, "data-type");
  if (!declared || declared.toLowerCase() !== mathType) return "";

  const latex = readAttribute(raw, "data-latex");
  if (latex === null) return "";

  return ` data-type="${mathType}" data-latex="${escapeAttributeValue(latex)}"`;
}

function rewriteTags(html: string): string {
  return html.replace(
    TAG_PATTERN,
    (_match, closing: string, rawName: string, rawAttributes: string) => {
      const tag = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
      if (VOID_TAGS.has(tag)) return `<${tag}>`;
      return `<${tag}${keepAttributes(tag, rawAttributes)}>`;
    },
  );
}

export function sanitizeRichText(html: string): string {
  if (!html) return "";

  let out = stripContentDroppingTags(html);
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  // Rewrite to a fixed point. One pass is not enough: dropping a tag can bring
  // a forbidden tag's opening and closing halves together.
  for (let pass = 0; pass < 5; pass += 1) {
    const next = rewriteTags(out);
    if (next === out) break;
    out = next;
  }

  return out;
}
