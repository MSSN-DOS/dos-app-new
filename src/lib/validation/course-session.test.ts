import { expect, it } from "vitest";
import { courseCreateSchema } from "./structure";
const body = { code: "MME 101", title: "Metallurgy", levelId: 1, semester: "harmattan", scopeType: "general" };
it("requires an explicit valid academic session", () => {
  expect(courseCreateSchema.safeParse(body).success).toBe(false);
  expect(courseCreateSchema.safeParse({ ...body, sessionId: 0 }).success).toBe(false);
  expect(courseCreateSchema.parse({ ...body, sessionId: "3" }).sessionId).toBe(3);
});
