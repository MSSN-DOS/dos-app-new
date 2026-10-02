import { describe, expect, it } from "vitest";

import { sanitizeRichText } from "./sanitize";

/**
 * `sanitizeRichText` is the server-side trust boundary for question stems, which render through
 * `dangerouslySetInnerHTML` in every student's attempt screen. These tests exist because there
 * were none, and because a regex sanitizer's real risk is the payload it does not anticipate —
 * so each case below is a specific bypass shape, not a restatement of the implementation.
 */
describe("sanitizeRichText", () => {
  it("keeps the rich-text formatting stems actually use", () => {
    // If this regresses, every superscript/chemical-formula question silently loses its
    // formatting — the visible symptom is worse than an XSS hole for day-to-day authoring.
    expect(sanitizeRichText("What is <b>2+2</b> and <i>x</i>?")).toBe(
      "What is <b>2+2</b> and <i>x</i>?",
    );
    expect(sanitizeRichText("H<sub>2</sub>O")).toBe("H<sub>2</sub>O");
    expect(sanitizeRichText("CO<sup>2</sup>")).toBe("CO<sup>2</sup>");
  });

  it("removes script elements together with their contents", () => {
    expect(sanitizeRichText("<script>alert(1)</script>What is 2+2?")).toBe("What is 2+2?");
    expect(sanitizeRichText("<SCRIPT>alert(1)</SCRIPT>x")).toBe("x");
    expect(sanitizeRichText("<style>body{display:none}</style>x")).toBe("x");
    expect(sanitizeRichText('<iframe src="http://evil.test"></iframe>x')).toBe("x");
  });

  it("strips event-handler attributes in every quoting style", () => {
    // Unquoted handlers are the classic bypass: an attribute-value regex that assumes quotes
    // leaves `onerror=alert(1)` intact.
    expect(sanitizeRichText('<img src=x onerror="alert(1)">')).toBe("");
    expect(sanitizeRichText("<img src=x onerror=alert(1)>")).toBe("");
    expect(sanitizeRichText("<img src=x onerror='alert(1)'>")).toBe("");
    // A newline between attributes is still attribute separation.
    expect(sanitizeRichText('<img\nsrc="x"\nonerror="alert(1)">')).toBe("");
  });

  it("neutralises javascript: URLs regardless of case or entity encoding", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeRichText('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe("x");
    // HTML entities decode before the URL is used, so `&#115;` is `s`.
    expect(sanitizeRichText('<a href="java&#115;cript:alert(1)">x</a>')).toBe("x");
    // A tab inside the scheme is stripped by browsers, so `java\tscript:` still executes.
    expect(sanitizeRichText('<a href="java\tscript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeRichText('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toBe("x");
  });

  it("drops tags outside the allowlist rather than escaping them", () => {
    // `img` is not allowlisted, so a payload that rides on one is removed with the tag.
    expect(sanitizeRichText('<img src="http://x.test/a.png">')).toBe("");
    expect(sanitizeRichText("<svg onload=alert(1)>")).toBe("");
  });

  it("keeps inner text when it strips a disallowed tag", () => {
    // Losing the question text entirely would be worse than losing the tag.
    expect(sanitizeRichText("<datalist><option>pick one</option></datalist>")).toBe("pick one");
  });

  it("handles empty and absent input without throwing", () => {
    expect(sanitizeRichText("")).toBe("");
    expect(sanitizeRichText("   ")).toBe("   ");
  });

  it("is idempotent, so a re-save never degrades the stem", () => {
    // Sanitising runs on every write. If it were not idempotent, editing a question repeatedly
    // would ratchet its formatting away.
    const once = sanitizeRichText('<span style="color:red">H<sub>2</sub>O</span>');
    expect(sanitizeRichText(once)).toBe(once);
    // Inline style is stripped, leaving the text and its tags intact.
    expect(once).toBe("<span>H<sub>2</sub>O</span>");
  });
});