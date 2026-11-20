import { describe, expect, it } from "vitest";
import { persistQuizRichText, refreshQuizRichText } from "./images";
describe("quiz image renewal", () => {
  const path = "quizzes/1/diagram.png";
  const oldUrl = `https://example.supabase.co/storage/v1/object/sign/quiz-images/${path}?token=old`;
  const newUrl = oldUrl.replace("old", "fresh");
  const html = `<p>Unsaved explanation</p><img src="${oldUrl}" data-storage-path="${path}" alt="Diagram">`;
  it("renews links while preserving unsaved content and storage paths", () => {
    const fresh = refreshQuizRichText(html, new Map([[path, newUrl]]));
    expect(fresh).toContain(newUrl);
    expect(fresh).toContain("Unsaved explanation");
    expect(persistQuizRichText(fresh)).toBe(persistQuizRichText(html));
  });
  it("keeps current previews while renewal is pending", () => {
    expect(refreshQuizRichText(html, new Map())).toBe(html);
  });
});
