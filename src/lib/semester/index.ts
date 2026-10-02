import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { courses } from "@/lib/db/schema/courses";
import { semesterSettings } from "@/lib/db/schema/semester";
import { academicSessions } from "@/lib/db/schema/academic-sessions";
import {
  pickSessionForDate,
  type ActiveSemester,
  type ResolvedSemester,
  type SessionDates,
} from "./calendar";

export type { ActiveSemester, ResolvedSemester, SemesterName, SessionDates } from "./calendar";

/** The `academic_sessions` columns the resolver needs, shaped as the pure layer wants them. */
const sessionDates = {
  id: academicSessions.id,
  label: academicSessions.label,
  harmattanStart: academicSessions.harmattanStart,
  harmattanEnd: academicSessions.harmattanEnd,
  rainStart: academicSessions.rainStart,
  rainEnd: academicSessions.rainEnd,
};

/**
 * Single active-semester resolver (DESIGN.md §8). Every query scoped "to the active semester"
 * calls this — never re-derive it inline from `new Date()`.
 *
 * The session calendar is read from the `academic_sessions` table rather than a hardcoded config
 * (amended 2026-09-30), so the 2026/27 dates are an Admin entering a row rather than a code
 * change and a deploy. The return is a discriminated union rather than a bare semester string:
 * `harmattan` alone cannot say which session it belongs to, and callers need the session id to
 * match `courses.session_id`.
 */
export async function getActiveSemester(db: Db): Promise<ResolvedSemester> {
  const [allSessions, settingRows] = await Promise.all([
    db
      .select(sessionDates)
      .from(academicSessions)
      .orderBy(asc(academicSessions.harmattanStart)),
    db
      .select({
        mode: semesterSettings.mode,
        manualOverride: semesterSettings.manualOverride,
        manualOverrideSessionId: semesterSettings.manualOverrideSessionId,
      })
      .from(semesterSettings)
      .orderBy(asc(semesterSettings.id))
      .limit(1),
  ]);

  const known: SessionDates[] = allSessions;
  const settings = settingRows[0];

  // Manual mode wins over the calendar — that is its whole job (DESIGN.md §8: the safety net
  // for dates that have drifted from what is entered). The DB CHECK guarantees the pair is
  // stored together, so a manual row always resolves to a real session label here.
  if (
    settings?.mode === "manual" &&
    settings.manualOverride &&
    settings.manualOverrideSessionId
  ) {
    const manual: ActiveSemester = {
      semester: settings.manualOverride,
      sessionId: settings.manualOverrideSessionId,
      sessionLabel:
        known.find((s) => s.id === settings.manualOverrideSessionId)?.label ?? "",
      source: "manual",
    };
    return { ok: true, ...manual };
  }

  const picked = pickSessionForDate(known, new Date());
  if (!picked) return { ok: false, reason: "no-session", source: "auto" };
  return {
    ok: true,
    semester: picked.semester,
    sessionId: picked.session.id,
    sessionLabel: picked.session.label,
    source: "auto",
  };
}

/**
 * The `WHERE` fragment matching courses in the active semester *and* session.
 *
 * Every "scoped to the active semester" query builds its filter through this function rather
 * than hand-rolling `eq(courses.semester, …)`. The hand-rolled form is what let the quiz and
 * resource filters drift apart, and the session id is exactly the part that is easy to forget.
 *
 * Fails CLOSED. When no session resolves, returns `sql\`false\`` — a predicate that is present
 * and always false — rather than `undefined`.
 *
 * This distinction is load-bearing. Drizzle's `and()`/`or()` *drop* `undefined` arguments:
 *
 * ```js
 * // drizzle-orm/sql/expressions/conditions.js — and()
 * const conditions = unfilteredConditions.filter((c) => c !== void 0);
 * ```
 *
 * So returning `undefined` would not mean "match nothing"; it would mean the semester and
 * session predicates disappear from the query entirely and the filter returns *every* course at
 * the caller's other constraints — across all sessions and both semesters. With no calendar
 * entered, the portal must show no semester-scoped content rather than the wrong session's, so
 * the predicate has to stay in the query and evaluate false.
 */
export function activeCourseFilter(resolved: ResolvedSemester): SQL {
  if (!resolved.ok) return sql`false`;
  // `and()` is typed `SQL | undefined` because an *empty* argument list yields no predicate. Two
  // `eq()` calls never do, so the `??` is unreachable at runtime — it is here to keep the return
  // type non-optional. The non-optional type is the whole point: a caller cannot accidentally
  // reintroduce the `undefined` that makes the filter vanish.
  return (
    and(
      eq(courses.semester, resolved.semester),
      eq(courses.sessionId, resolved.sessionId),
    ) ?? sql`false`
  );
}
