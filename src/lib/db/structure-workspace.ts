import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from ".";
import { lockStructureWrites } from "./structure-lock";
import {
  academicSessions,
  courses,
  courseFaculties,
  departments,
  departmentLevels,
  faculties,
  levels,
  topics,
} from "./schema";
import type {
  WorkspaceQuery,
  WorkspaceOperation,
  StructureKind,
} from "@/lib/validation/structure-workspace";

export class StructureConflict extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type StructureNode = {
  kind: StructureKind;
  id: number;
  title: string;
  sessionId?: number;
  subtitle?: string;
  count?: number;
};
export async function structureWorkspace(input: WorkspaceQuery) {
  const db = getDb();
  const session = input.sessionId ? eq(courses.sessionId, input.sessionId) : undefined;
  if (input.mode === "root") {
    const [facultyRows, departmentRows, levelRows, memberships, sessions] =
      await Promise.all([
        db.select().from(faculties).orderBy(asc(faculties.name)),
        db.select().from(departments).orderBy(asc(departments.name)),
        db.select().from(levels).orderBy(asc(levels.value)),
        db.select().from(departmentLevels).orderBy(asc(departmentLevels.departmentId)),
        db
          .select({ id: academicSessions.id, label: academicSessions.label })
          .from(academicSessions)
          .orderBy(asc(academicSessions.label)),
      ]);
    return {
      faculties: facultyRows,
      departments: departmentRows,
      levels: levelRows,
      departmentLevels: memberships,
      sessions,
    };
  }
  if (input.mode === "record") {
    if (!input.id) throw new StructureConflict(422, "Choose a record");
    if (input.kind === "topic") {
      const [row] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, input.id))
        .limit(1);
      if (!row) throw new StructureConflict(404, "Topic not found");
      return row;
    }
    if (input.kind === "course") {
      const [row] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, input.id))
        .limit(1);
      if (!row) throw new StructureConflict(404, "Course not found");
      const links = await db
        .select()
        .from(courseFaculties)
        .where(eq(courseFaculties.courseId, row.id))
        .orderBy(asc(courseFaculties.facultyId));
      return { ...row, facultyIds: links.map((x) => x.facultyId) };
    }
    throw new StructureConflict(422, "Unsupported record");
  }
  if (input.mode === "search") {
    if (!input.q) return { nodes: [] as StructureNode[], hasMore: false };
    const pattern = "%" + input.q.replace(/[\\%_]/g, (value) => "\\" + value) + "%";
    const [fs, ds, ls, cs, ts] = await Promise.all([
      db
        .select()
        .from(faculties)
        .where(ilike(faculties.name, pattern))
        .orderBy(asc(faculties.name))
        .limit(21),
      db
        .select()
        .from(departments)
        .where(ilike(departments.name, pattern))
        .orderBy(asc(departments.name))
        .limit(21),
      db
        .select()
        .from(levels)
        .where(sql`cast(${levels.value} as text) ilike ${pattern}`)
        .orderBy(asc(levels.value))
        .limit(21),
      db
        .select()
        .from(courses)
        .where(or(ilike(courses.code, pattern), ilike(courses.title, pattern)))
        .orderBy(asc(courses.code), asc(courses.id))
        .limit(21),
      db
        .select({
          id: topics.id,
          title: topics.title,
          sessionId: courses.sessionId,
          code: courses.code,
        })
        .from(topics)
        .innerJoin(courses, eq(topics.courseId, courses.id))
        .where(ilike(topics.title, pattern))
        .orderBy(asc(topics.title), asc(topics.id))
        .limit(21),
    ]);
    return {
      hasMore: [fs, ds, ls, cs, ts].some((rows) => rows.length > 20),
      nodes: [
        ...fs
          .slice(0, 20)
          .map((r) => ({ kind: "faculty" as const, id: r.id, title: r.name })),
        ...ds
          .slice(0, 20)
          .map((r) => ({ kind: "department" as const, id: r.id, title: r.name })),
        ...ls
          .slice(0, 20)
          .map((r) => ({ kind: "level" as const, id: r.id, title: r.value + "L" })),
        ...cs.slice(0, 20).map((r) => ({
          kind: "course" as const,
          id: r.id,
          title: r.code + " · " + r.title,
          sessionId: r.sessionId,
          subtitle: r.semester,
        })),
        ...ts.slice(0, 20).map((r) => ({
          kind: "topic" as const,
          id: r.id,
          title: r.title,
          sessionId: r.sessionId,
          subtitle: r.code,
        })),
      ] as StructureNode[],
    };
  }
  if (input.kind === "course" && input.id) {
    const rows = await db
      .select({ id: topics.id, title: topics.title })
      .from(topics)
      .where(eq(topics.courseId, input.id))
      .orderBy(asc(topics.title), asc(topics.id))
      .limit(11)
      .offset((input.page - 1) * 10);
    return {
      nodes: rows.slice(0, 10).map((r) => ({ ...r, kind: "topic" as const })),
      hasMore: rows.length > 10,
    };
  }
  const parent =
    input.kind === "faculty" && input.id
      ? and(eq(courses.scopeType, "faculty"), eq(courses.facultyId, input.id))
      : input.kind === "department" && input.id
        ? eq(courses.departmentId, input.id)
        : input.kind === "level" && input.id
          ? eq(courses.levelId, input.id)
          : inArray(courses.scopeType, ["general", "interfaculty"]);
  const rows = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      sessionId: courses.sessionId,
      sessionLabel: academicSessions.label,
      level: levels.value,
      semester: courses.semester,
      count: sql<number>`(select count(*)::int from ${topics} where ${topics.courseId} = ${courses.id})`,
    })
    .from(courses)
    .innerJoin(academicSessions, eq(academicSessions.id, courses.sessionId))
    .innerJoin(levels, eq(levels.id, courses.levelId))
    .where(and(parent, session))
    .orderBy(asc(courses.code), asc(courses.levelId), asc(courses.id))
    .limit(11)
    .offset((input.page - 1) * 10);
  return {
    nodes: rows.slice(0, 10).map((r) => ({
      kind: "course" as const,
      id: r.id,
      title: r.code + " · " + r.title,
      sessionId: r.sessionId,
      subtitle: r.sessionLabel + " · " + r.level + "L · " + r.semester,
      count: r.count,
    })),
    hasMore: rows.length > 10,
  };
}

export async function structureOperation(input: WorkspaceOperation, actorId: number) {
  return getDb().transaction(async (tx) => {
    await lockStructureWrites(tx);
    // All workspace batch operations serialize on the source course.
    const [source] = await tx
      .select()
      .from(courses)
      .where(eq(courses.id, input.courseId))
      .limit(1)
      .for("update");
    if (!source) throw new StructureConflict(404, "Course not found");
    if (input.action === "bulkTopics") {
      const existing = await tx
        .select({ title: topics.title })
        .from(topics)
        .where(eq(topics.courseId, source.id))
        .orderBy(asc(topics.id));
      const seen = new Set(existing.map((r) => r.title.toLocaleLowerCase()));
      const titles = input.titles.filter((title) => {
        const key = title.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (titles.length)
        await tx
          .insert(topics)
          .values(
            titles.map((title) => ({ title, courseId: source.id, createdBy: actorId })),
          );
      return { added: titles.length, skipped: input.titles.length - titles.length };
    }
    if (input.sessionId === source.sessionId)
      throw new StructureConflict(422, "Choose a different academic session");
    const [target] = await tx
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(eq(academicSessions.id, input.sessionId))
      .limit(1)
      .for("update");
    if (!target) throw new StructureConflict(422, "Academic session no longer exists");
    const [duplicate] = await tx
      .select({ id: courses.id })
      .from(courses)
      .where(
        and(
          eq(courses.sessionId, input.sessionId),
          eq(courses.code, source.code),
          eq(courses.levelId, source.levelId),
          eq(courses.semester, source.semester),
        ),
      )
      .limit(1);
    if (duplicate)
      throw new StructureConflict(
        409,
        "This course offering already exists in that session",
      );
    const { id: sourceId, ...values } = source;
    const [copy] = await tx
      .insert(courses)
      .values({ ...values, sessionId: input.sessionId })
      .returning();
    const links = await tx
      .select()
      .from(courseFaculties)
      .where(eq(courseFaculties.courseId, sourceId))
      .orderBy(asc(courseFaculties.facultyId));
    if (links.length)
      await tx
        .insert(courseFaculties)
        .values(links.map((r) => ({ courseId: copy.id, facultyId: r.facultyId })));
    if (input.includeTopics) {
      const rows = await tx
        .select({ title: topics.title })
        .from(topics)
        .where(eq(topics.courseId, sourceId))
        .orderBy(asc(topics.id));
      if (rows.length)
        await tx
          .insert(topics)
          .values(rows.map((r) => ({ ...r, courseId: copy.id, createdBy: actorId })));
    }
    return { id: copy.id, sessionId: copy.sessionId };
  });
}
