import { sanitizeRichText } from "@/lib/sanitize";

export const QUIZ_IMAGES_BUCKET = "quiz-images";
export const MAX_QUIZ_IMAGE_BYTES = 5 * 1024 * 1024;
export const QUIZ_IMAGE_REFRESH_MS = 8 * 60 * 1000;
/** Refresh a link without replacing local draft content or losing upload previews. */
export function refreshQuizRichText(html: string, urls: ReadonlyMap<string, string>): string {
  return sanitizeRichText(html).replace(/<img\b[^>]*>/g, (tag) => {
    const path = /data-storage-path="([^"]+)"/.exec(tag)?.[1];
    const url = path ? urls.get(path) : undefined;
    return url ? tag.replace(/src="[^"]*"/, `src="${url}"`) : tag;
  });
}
export function quizImagePaths(html: string): string[] {
  return [...new Set([...sanitizeRichText(html).matchAll(/data-storage-path="([^"]+)"/g)].map((m) => m[1]))];
}
/** Store stable object paths, never expiring signed URLs. */
export function persistQuizRichText(html: string): string {
  return sanitizeRichText(html).replace(/<img\b[^>]*>/g, (tag) => {
    const path = /data-storage-path="([^"]+)"/.exec(tag)?.[1];
    return path ? tag.replace(/src="[^"]*"/, `src="${path}"`) : "";
  });
}
export function resolveQuizRichText(html: string, urls: ReadonlyMap<string, string>): string {
  return persistQuizRichText(html).replace(/<img\b[^>]*>/g, (tag) => {
    const path = /data-storage-path="([^"]+)"/.exec(tag)?.[1];
    const url = path ? urls.get(path) : undefined;
    return url ? tag.replace(/src="[^"]*"/, `src="${url}"`) : "";
  });
}
/** Reject mislabeled uploads as well as SVG/executable formats. */
export function quizImageExtension(bytes: Uint8Array, type: string): "png" | "jpg" | "webp" | null {
  if (type === "image/png" && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) return "png";
  if (type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (type === "image/webp" && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "webp";
  return null;
}
