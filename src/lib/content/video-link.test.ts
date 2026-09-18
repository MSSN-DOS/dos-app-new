import { describe, expect, it } from "vitest";

import { isValidVideoLink, parseVideoLink } from "./video-link";

/** Narrow helper so the happy-path assertions stay readable. */
function link(raw: string) {
  const result = parseVideoLink(raw);
  if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`);
  return result.link;
}

describe("parseVideoLink — rejection", () => {
  it("rejects an empty value", () => {
    expect(parseVideoLink("").ok).toBe(false);
    expect(parseVideoLink("   ").ok).toBe(false);
  });

  it("rejects something that isn't a URL", () => {
    const result = parseVideoLink("chapter 3 video");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/https:\/\//);
  });

  it("rejects a javascript: URL", () => {
    // The important one: this is stored verbatim and rendered as an anchor href.
    expect(parseVideoLink("javascript:alert(1)").ok).toBe(false);
  });

  it("rejects a data: URL", () => {
    expect(parseVideoLink("data:text/html,<script>alert(1)</script>").ok).toBe(false);
  });

  it("rejects a file: URL", () => {
    expect(parseVideoLink("file:///etc/passwd").ok).toBe(false);
  });

  it("trims surrounding whitespace before parsing", () => {
    const result = parseVideoLink("  https://youtu.be/dQw4w9WgXcQ  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.link.fileId).toBe("dQw4w9WgXcQ");
  });
});

describe("parseVideoLink — Google Drive", () => {
  it("normalises a /view share link to an embeddable /preview", () => {
    const parsed = link("https://drive.google.com/file/d/1AbC_dEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing");
    expect(parsed.provider).toBe("google_drive");
    expect(parsed.fileId).toBe("1AbC_dEfGhIjKlMnOpQrStUvWxYz");
    expect(parsed.embedUrl).toBe("https://drive.google.com/file/d/1AbC_dEfGhIjKlMnOpQrStUvWxYz/preview");
    expect(parsed.watchUrl).toBe("https://drive.google.com/file/d/1AbC_dEfGhIjKlMnOpQrStUvWxYz/view");
  });

  it("keeps a link that is already /preview usable and embeddable", () => {
    const parsed = link("https://drive.google.com/file/d/FILEID123/preview");
    expect(parsed.embedUrl).toBe("https://drive.google.com/file/d/FILEID123/preview");
    expect(parsed.watchUrl).toBe("https://drive.google.com/file/d/FILEID123/view");
  });

  it("reads the id out of the older /open?id= form", () => {
    const parsed = link("https://drive.google.com/open?id=OLDSTYLE99");
    expect(parsed.fileId).toBe("OLDSTYLE99");
    expect(parsed.embedUrl).toBe("https://drive.google.com/file/d/OLDSTYLE99/preview");
  });

  it("reads the id out of a drive.usercontent.google.com download link", () => {
    const parsed = link("https://drive.usercontent.google.com/download?id=DLID777&export=download");
    expect(parsed.fileId).toBe("DLID777");
  });

  it("never offers an embed for a folder — folders have no player", () => {
    const parsed = link("https://drive.google.com/drive/folders/FOLDER456");
    expect(parsed.provider).toBe("google_drive");
    expect(parsed.embedUrl).toBeNull();
    expect(parsed.watchUrl).toBe("https://drive.google.com/drive/folders/FOLDER456");
  });

  it("falls back to a plain link for a Drive URL with no readable id", () => {
    const parsed = link("https://drive.google.com/");
    expect(parsed.provider).toBe("google_drive");
    expect(parsed.fileId).toBeNull();
    expect(parsed.embedUrl).toBeNull();
    expect(parsed.watchUrl).toBe("https://drive.google.com/");
  });

  it("accepts a docs.google.com host as Drive", () => {
    expect(link("https://docs.google.com/file/d/DOCID1/view").provider).toBe("google_drive");
  });
});

describe("parseVideoLink — YouTube", () => {
  it("normalises a watch link", () => {
    const parsed = link("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(parsed.provider).toBe("youtube");
    expect(parsed.fileId).toBe("dQw4w9WgXcQ");
    expect(parsed.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("normalises a youtu.be short link", () => {
    const parsed = link("https://youtu.be/dQw4w9WgXcQ");
    expect(parsed.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("normalises a shorts link", () => {
    const parsed = link("https://www.youtube.com/shorts/abcdEFGH123");
    expect(parsed.embedUrl).toBe("https://www.youtube.com/embed/abcdEFGH123");
  });

  it("keeps an already-embed link working", () => {
    const parsed = link("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(parsed.watchUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("carries the playlist timestamp params into the watch URL only", () => {
    const parsed = link("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s");
    expect(parsed.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(parsed.watchUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("refuses an embed when the id is not plausible", () => {
    const parsed = link("https://www.youtube.com/watch?v=x");
    expect(parsed.provider).toBe("youtube");
    expect(parsed.embedUrl).toBeNull();
  });
});

describe("parseVideoLink — other hosts", () => {
  it("treats a Telegram post as a link, not an embed", () => {
    const parsed = link("https://t.me/dossite/42");
    expect(parsed.provider).toBe("telegram");
    expect(parsed.embedUrl).toBeNull();
    expect(parsed.watchUrl).toBe("https://t.me/dossite/42");
  });

  it("accepts an unknown host as a plain link", () => {
    const parsed = link("https://vimeo.com/123456789");
    expect(parsed.provider).toBe("other");
    expect(parsed.embedUrl).toBeNull();
  });

  it("refuses to embed an http link — mixed content would be blocked anyway", () => {
    const parsed = link("http://example.com/lecture.mp4");
    expect(parsed.provider).toBe("other");
    expect(parsed.embedUrl).toBeNull();
  });

  it("is exposed through isValidVideoLink", () => {
    expect(isValidVideoLink("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isValidVideoLink("javascript:alert(1)")).toBe(false);
  });
});
