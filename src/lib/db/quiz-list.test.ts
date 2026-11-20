import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { authoringQuizConditions } from "./quiz-list";
import { quizListFiltersSchema } from "@/lib/validation/quizzes";

describe("quiz list filters", () => {
  it("keeps teacher ownership while combining filters and escaping literal search characters", () => {
    const filters = quizListFiltersSchema.parse({
      search: "  rate_50%  ",
      type: "course",
      status: "draft",
      courseId: "2",
    });
    const query = and(
      ...authoringQuizConditions({ userId: 5, roleId: 2, roleName: "teacher" }, filters),
    );
    expect(query).toBeDefined();
    if (!query) throw new Error("Expected filter query");
    const compiled = new PgDialect().sqlToQuery(query);
    expect(compiled.params).toEqual([5, "course", "draft", 2, "%rate\\_50\\%%"]);
    expect(compiled.sql).toContain('"quizzes"."created_by"');
    expect(compiled.sql).toContain("ilike");
  });
  it("leaves the unfiltered admin catalogue unrestricted", () => {
    expect(
      authoringQuizConditions(
        { userId: 1, roleId: 1, roleName: "admin" },
        quizListFiltersSchema.parse({}),
      ),
    ).toEqual([]);
  });
  it("rejects invalid filters and oversized searches", () => {
    for (const input of [
      { status: "live" },
      { type: "private" },
      { courseId: 0 },
      { search: "x".repeat(201) },
    ]) {
      expect(quizListFiltersSchema.safeParse(input).success).toBe(false);
    }
  });
});
