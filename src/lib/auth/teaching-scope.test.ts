import { beforeEach, describe, expect, it } from "vitest";

import { makeDbMock, stubSelect, type DbMock } from "@/lib/testing/route-test";

import {
  getTeachingScope,
  isCourseAllowed,
  isJambSubjectAllowed,
  isTrackAllowed,
  type TeachingScope,
} from "./teaching-scope";

type ScopeDb = Parameters<typeof getTeachingScope>[0];

let db: DbMock;
const asDb = () => db as unknown as ScopeDb;

beforeEach(() => {
  db = makeDbMock();
});

const TEACHER = { userId: 5, roleId: 2, roleName: "teacher" as const };
const ADMIN = { userId: 1, roleId: 1, roleName: "admin" as const };

describe("getTeachingScope", () => {
  it("leaves an admin unrestricted without querying assignments", async () => {
    const scope = await getTeachingScope(asDb(), ADMIN);
    expect(scope.unrestricted).toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("splits a teacher's assignments into courses and JAMB subjects", async () => {
    stubSelect(db, [
      [
        { courseId: 3, jambSubjectId: null },
        { courseId: null, jambSubjectId: 7 },
        { courseId: 4, jambSubjectId: null },
      ],
    ]);

    const scope = await getTeachingScope(asDb(), TEACHER);
    expect(scope.unrestricted).toBe(false);
    expect(scope.courseIds).toEqual([3, 4]);
    expect(scope.jambSubjectIds).toEqual([7]);
  });

  it("fails closed for a teacher with no assignments", async () => {
    stubSelect(db, [[]]);

    const scope = await getTeachingScope(asDb(), TEACHER);
    expect(scope.unrestricted).toBe(false);
    expect(scope.courseIds).toEqual([]);
    expect(scope.jambSubjectIds).toEqual([]);
    // Nothing is allowed, which is the safe direction.
    expect(isCourseAllowed(scope, 3)).toBe(false);
  });

  it("fails closed when the role was never resolved", async () => {
    stubSelect(db, [[]]);

    // requireAuth only sets roleName when it is given an allowedRoles list. An unresolved role
    // must not be mistaken for an admin.
    const scope = await getTeachingScope(asDb(), { userId: 9, roleId: 2 });
    expect(scope.unrestricted).toBe(false);
  });
});

describe("scope predicates", () => {
  const teacherScope: TeachingScope = {
    unrestricted: false,
    courseIds: [3, 4],
    jambSubjectIds: [7],
  };
  const adminScope: TeachingScope = {
    unrestricted: true,
    courseIds: [],
    jambSubjectIds: [],
  };

  it("allows only assigned courses", () => {
    expect(isCourseAllowed(teacherScope, 3)).toBe(true);
    expect(isCourseAllowed(teacherScope, 4)).toBe(true);
    expect(isCourseAllowed(teacherScope, 99)).toBe(false);
  });

  it("allows only assigned JAMB subjects", () => {
    expect(isJambSubjectAllowed(teacherScope, 7)).toBe(true);
    expect(isJambSubjectAllowed(teacherScope, 8)).toBe(false);
  });

  it("lets an admin through every check", () => {
    expect(isCourseAllowed(adminScope, 99)).toBe(true);
    expect(isJambSubjectAllowed(adminScope, 99)).toBe(true);
    expect(isTrackAllowed(adminScope, { courseId: 99 })).toBe(true);
  });

  it("checks whichever track the payload carries", () => {
    expect(isTrackAllowed(teacherScope, { courseId: 3 })).toBe(true);
    expect(isTrackAllowed(teacherScope, { courseId: 99 })).toBe(false);
    expect(isTrackAllowed(teacherScope, { jambSubjectId: 7 })).toBe(true);
    expect(isTrackAllowed(teacherScope, { jambSubjectId: 8 })).toBe(false);
  });

  it("prefers the course when a payload somehow carries both", () => {
    expect(isTrackAllowed(teacherScope, { courseId: 3, jambSubjectId: 8 })).toBe(true);
    expect(isTrackAllowed(teacherScope, { courseId: 99, jambSubjectId: 7 })).toBe(false);
  });

  it("denies a payload with neither track", () => {
    expect(isTrackAllowed(teacherScope, {})).toBe(false);
    expect(isTrackAllowed(teacherScope, { courseId: null, jambSubjectId: null })).toBe(false);
  });
});
