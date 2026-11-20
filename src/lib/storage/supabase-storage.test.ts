import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQuizImageSignedUrl, uploadQuizImageObject } from "./supabase-storage";
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("private quiz Storage transport", () => {
  it("bounds requests and signs a ten-minute URL", async () => {
    fetchMock.mockResolvedValue(Response.json({ signedURL: "/object/sign/quiz-images/quizzes/1/image.png?token=synthetic" }));
    expect(await createQuizImageSignedUrl("quizzes/1/image.png")).toContain("/storage/v1/object/sign/");
    const init = fetchMock.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({ expiresIn: 600 });
  });
  it("refuses uploads into a public bucket", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 })).mockResolvedValueOnce(Response.json({ public: true }));
    await expect(uploadQuizImageObject("quizzes/1/image.png", new Blob(["image"], { type: "image/png" }))).rejects.toThrow("must be private");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
