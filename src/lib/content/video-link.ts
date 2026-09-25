/**
 * Parses a video link a Teacher or Admin pasted into something safe to store and safe to
 * render. Pure — no DB, no I/O — so it can be unit-tested and reused by both the Zod
 * schema (server + client) and the resources UI.
 *
 * Why this exists at all: Google Drive `/view` links are the ones people actually copy out
 * of Drive, and Google refuses to frame them (`frame-ancestors`). Embedding the pasted URL
 * therefore renders a blank box that looks like it loaded. Only `/preview` embeds. Rather
 * than teach every teacher that, we normalise here and store the URL they gave us.
 */

export type VideoProvider = "google_drive" | "youtube" | "telegram" | "other";

export const PROVIDER_LABEL: Record<VideoProvider, string> = {
  google_drive: "Google Drive",
  youtube: "YouTube",
  telegram: "Telegram",
  other: "Link",
};

export interface ParsedVideoLink {
  provider: VideoProvider;
  /** Provider file/post id when the URL exposes one — null for folders and unknown hosts. */
  fileId: string | null;
  /** The page a student opens. Always present. */
  watchUrl: string;
  /**
   * An iframe-safe URL, or null when this link must not be embedded — a Drive folder, a
   * Telegram post, an unknown host, or a plain-http URL on our https page (mixed content
   * would be blocked by the browser anyway).
   */
  embedUrl: string | null;
}

export type ParseVideoLinkResult =
  | { ok: true; link: ParsedVideoLink }
  | { ok: false; message: string };

const DRIVE_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "drive.usercontent.google.com",
]);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const TELEGRAM_HOSTS = new Set(["t.me", "www.t.me", "telegram.me", "www.telegram.me"]);

/** YouTube ids are 11 chars of [A-Za-z0-9_-]; be a little lenient, but not unbounded. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,64}$/;

function driveFileLink(fileId: string): ParsedVideoLink {
  return {
    provider: "google_drive",
    fileId,
    watchUrl: `https://drive.google.com/file/d/${fileId}/view`,
    embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
  };
}

function driveFolderLink(folderId: string): ParsedVideoLink {
  return {
    provider: "google_drive",
    fileId: folderId,
    watchUrl: `https://drive.google.com/drive/folders/${folderId}`,
    // A folder has no player, so there is nothing to frame.
    embedUrl: null,
  };
}

function parseDrive(url: URL): ParsedVideoLink {
  const file = /^\/file\/d\/([^/]+)/.exec(url.pathname);
  if (file?.[1]) return driveFileLink(decodeURIComponent(file[1]));

  const folder = /^\/drive\/folders\/([^/]+)/.exec(url.pathname);
  if (folder?.[1]) return driveFolderLink(decodeURIComponent(folder[1]));

  // /open?id=<ID>, /uc?id=<ID>, drive.usercontent.google.com/download?id=<ID>
  const queryId = url.searchParams.get("id");
  if (queryId) {
    const trimmed = queryId.trim();
    if (/^\/drive\/folders\//.test(url.pathname)) return driveFolderLink(trimmed);
    return driveFileLink(trimmed);
  }

  // A Drive URL we recognise the host of but can't read an id out of. Keep it usable as a
  // plain link rather than rejecting it — the host is legitimate and we may just be behind.
  return { provider: "google_drive", fileId: null, watchUrl: url.href, embedUrl: null };
}

function parseYouTube(url: URL): ParsedVideoLink {
  let candidate: string | null = null;

  if (url.hostname.endsWith("youtu.be")) {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else {
    const v = url.searchParams.get("v");
    if (v) {
      candidate = v;
    } else {
      const path = /^\/(?:embed|shorts|v)\/([^/]+)/.exec(url.pathname);
      candidate = path?.[1] ?? null;
    }
  }

  const id = candidate?.trim() ?? "";
  if (!YOUTUBE_ID.test(id)) {
    return { provider: "youtube", fileId: null, watchUrl: url.href, embedUrl: null };
  }

  return {
    provider: "youtube",
    fileId: id,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}`,
  };
}

/**
 * Accepts a pasted link and returns a normalised, embeddable description of it.
 *
 * Rejects anything that isn't http/https — critically, `javascript:` and `data:` URLs,
 * which would otherwise be stored verbatim and rendered as an anchor href.
 */
export function parseVideoLink(raw: string): ParseVideoLinkResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, message: "Paste the video link." };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message: "That doesn't look like a link — paste the full address starting with https://",
    };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      ok: false,
      message: "Only http:// and https:// links can be used.",
    };
  }

  const host = url.hostname.toLowerCase();
  let link: ParsedVideoLink;

  if (DRIVE_HOSTS.has(host)) {
    link = parseDrive(url);
  } else if (YOUTUBE_HOSTS.has(host)) {
    link = parseYouTube(url);
  } else if (TELEGRAM_HOSTS.has(host)) {
    // Telegram post embeds need their widget script; a plain link is the honest option.
    link = { provider: "telegram", fileId: null, watchUrl: url.href, embedUrl: null };
  } else {
    link = { provider: "other", fileId: null, watchUrl: url.href, embedUrl: null };
  }

  // Mixed content: an http iframe on our https page is blocked, so never offer one.
  if (link.embedUrl !== null && !link.embedUrl.startsWith("https://")) {
    link = { ...link, embedUrl: null };
  }

  return { ok: true, link };
}

/** Convenience for the Zod schema and the UI's inline validation. */
export function isValidVideoLink(raw: string): boolean {
  return parseVideoLink(raw).ok;
}
