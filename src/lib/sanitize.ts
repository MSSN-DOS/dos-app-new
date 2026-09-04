// Lightweight HTML sanitizer for rich-text question bodies.
// Strips executable content (<script>, <style>, event handlers, javascript: URLs)
// without adding a runtime dependency. For full XSS coverage, prefer DOMPurify
// when a heavier sanitizer is acceptable.
export function sanitizeRichText(html: string): string {
  if (!html) return "";
  let out = html;
  // Remove script/style/iframe/object/embed tags and contents
  out = out.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  // Strip event handler attributes (onclick, onerror, etc.) — quoted or unquoted
  out = out.replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");
  // Neutralize javascript: / data: / vbscript: in href/src/xlink:href
  out = out.replace(
    /\s+(href|src|xlink:href)\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi,
    (match) => {
      const lower = match.toLowerCase();
      if (lower.includes("javascript:") || lower.includes("data:text/html") || lower.includes("vbscript:")) {
        return "";
      }
      return match;
    },
  );
  // Allow only a safe allowlist: b, i, u, em, strong, sub, sup, br, p, ul, ol, li, span (for styling)
  // Strip any tag not in allowlist while keeping its inner text
  const allow = new Set(["b", "i", "u", "em", "strong", "sub", "sup", "br", "p", "ul", "ol", "li", "span", "div"]);
  out = out.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (m, tag: string) => {
    const t = tag.toLowerCase();
    if (allow.has(t)) return m.replace(/\s+style\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");
    // Keep text content for disallowed tags by removing the tag itself
    // But keep closing behavior: remove entirely
    if (m.startsWith("</")) return "";
    // Self-closing or opening: remove tag but not inner text (handled by regex replacement)
    return "";
  });
  return out;
}
