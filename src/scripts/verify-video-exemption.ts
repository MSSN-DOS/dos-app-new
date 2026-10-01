/**
 * Live verification of the video semester-exemption (P6, Board decision 2026-09-17).
 *
 * WHY THIS IS A SCRIPT AND NOT A UNIT TEST
 * ----------------------------------------
 * `GET /api/resources` filters course-bound content with
 * `or(eq(contentItems.type, "video"), activeCourseFilter(activeSemester))` — videos are
 * reference material that must survive a semester rollover, while PDFs and articles obey the
 * active semester.
 *
 * The colocated `route.test.ts` cannot prove that clause works: its `where()` stub ignores the
 * arguments it is handed, so the assertion passes no matter what SQL is actually built. That is
 * a vacuous test. Only real SQL against real rows can distinguish "videos are exempted" from
 * "the filter accidentally matches everything".
 *
 * So this script signs a REAL session JWT for an existing student and calls the REAL exported
 * `GET()` handler, twice, with the active semester flipped in between. Everything under test is
 * production code — auth, access conditions, semester resolution and the filter itself.
 *
 * WHAT IT ASSERTS (3 scenarios x 6 fixtures = 18 assertions)
 *   harmattan @ 2025/26 : H.video H.pdf visible, R.video visible, R.pdf HIDDEN, probe HIDDEN
 *   rain      @ 2025/26 : H.video visible, H.pdf HIDDEN, R.video+R.pdf visible, probe HIDDEN
 *   harmattan @ probe   : probe video+pdf visible, H.pdf HIDDEN, R.pdf HIDDEN
 * The rows that must flip are the point: the same PDF goes from visible to hidden when the active
 * semester moves, and the same-semester PDF in another session flips when the *session* moves,
 * while every video stays visible throughout.
 *
 * Both axes matter because `activeCourseFilter` filters on semester AND session. A regression
 * that dropped the `session_id` predicate would leave all 8 of the original semester-only
 * assertions green while leaking the wrong session's coursework — the script originally pinned
 * the session, so nothing caught that. It now creates its own throwaway session and course so
 * the session axis is genuinely exercised.
 *
 * SAFETY
 *   - Inserts 6 content rows titled with the P6VERIFY prefix and deletes exactly those ids.
 *   - Inserts one throwaway `academic_sessions` row (`9000/01`, far-future dates so it cannot
 *     win an auto-resolution) plus one course cloned from the Harmattan course's scope, and
 *     deletes both in the same `finally`. The session id is `generatedAlwaysAsIdentity`, so
 *     deleting it leaves the sequence advanced — harmless, gaps in the sequence are normal.
 *   - Refuses to run until the calendar has exactly the shape it needs (>=2 sessions, one
 *     Harmattan and one Rain course in the first), so it fails loudly rather than silently
 *     skipping the session axis.
 *   - Snapshots `semester_settings` first and restores it in the same `finally`.
 *   - Refuses to run against anything but an allowlisted dev project (see
 *     `assert-dev-environment.ts`); the previous NODE_ENV check could not fire under tsx.
 *   - Exits non-zero if any assertion fails, so it is usable as a gate.
 *
 * Usage:  pnpm db:verify:video
 */

import process from "node:process";

import { asc, eq, like } from "drizzle-orm";

import { assertDevEnvironment } from "./assert-dev-environment";

const PREFIX = "P6VERIFY";
/**
 * The throwaway session's label. `academic_sessions_label_format` CHECKs `^\d{4}/\d{2}$`, and
 * `9000/01` is visibly synthetic so a leftover row can never be mistaken for Board data.
 */
const PROBE_SESSION_LABEL = "9000/01";
/** Code and title for the throwaway course, so a leftover row is identifiable as ours. */
const PROBE_COURSE_CODE = "P6VERIFYX1";
const PROBE_COURSE_TITLE = "P6VERIFY probe course";

type VerificationRow = { id: number; type: string; title: string };


function assertSafeExecution(): void {
  // This script inserts into content_items and rewrites the global semester_settings override.
  // `assertDevEnvironment` identifies the database by Supabase project ref rather than by
  // NODE_ENV, which tsx never sets and which therefore never fired. It also loads .env.local/.env
  // itself, so this must not pre-check DATABASE_URL.
  assertDevEnvironment("verify-video-exemption");
}

async function main(): Promise<void> {
  assertSafeExecution();

  const { getDb, getDbClient } = await import("../lib/db");
  const { contentItems } = await import("../lib/db/schema/content");
  const { courses } = await import("../lib/db/schema/courses");
  const { academicSessions } = await import("../lib/db/schema/academic-sessions");
  const { semesterSettings } = await import("../lib/db/schema/semester");
  const { users, roles } = await import("../lib/db/schema/auth");
  const { studentProfiles } = await import("../lib/db/schema/profiles");
  const { signSession } = await import("../lib/auth/jwt");
  const { GET } = await import("../app/api/resources/route");

  const db = getDb();
  // `getDb()` caches a postgres.js pool, and an open pool keeps the event loop alive, so a
  // script that finishes its work would still hang instead of exiting with a status code.
  // Closing the client in the outer `finally` is what makes this usable as a gate.
  try {
    await run();
  } finally {
    await getDbClient().end();
  }

  /**
   * Deletes anything a *previous* run left behind, so this one can always start clean.
   *
   * A run killed mid-flight (SIGINT, a crash inside the handler, a lost connection) never reaches
   * its own `finally`, and the leftovers are not inert: the probe session keeps `semester_settings`
   * pointing at it via the last scenario's override, so the portal's active semester is pinned to a
   * session that should not exist. Worse, the *next* run then fails its own insert on
   * `academic_sessions_label_key` and the script is permanently wedged until someone hand-edits the
   * database. Both failure modes were hit in practice while building this.
   *
   * Order is reverse-dependency: repoint the override off the probe session, delete the probe
   * course (and its content), then the probe session. `academic_sessions.id` is referenced by both
   * `courses.session_id` and `semester_settings.manual_override_session_id`, so neither can be
   * deleted while the other still points at it.
   */
  async function removeLeftovers(): Promise<void> {
    const leftoverCourses = await db
      .select({ id: courses.id })
      .from(courses)
      .where(like(courses.code, `${PROBE_COURSE_CODE}%`));
    const leftoverSessions = await db
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(eq(academicSessions.label, PROBE_SESSION_LABEL));

    if (leftoverCourses.length === 0 && leftoverSessions.length === 0) return;

    console.warn(
      `removing ${leftoverCourses.length} leftover probe course(s) and ` +
        `${leftoverSessions.length} leftover probe session(s) from a previous run`,
    );

    if (leftoverSessions.length > 0) {
      const [settings] = await db
        .select({ manualOverrideSessionId: semesterSettings.manualOverrideSessionId })
        .from(semesterSettings)
        .where(eq(semesterSettings.id, 1));

      if (
        settings?.manualOverrideSessionId !== null &&
        leftoverSessions.some((s) => s.id === settings?.manualOverrideSessionId)
      ) {
        // The override cannot be cleared — the CHECK `semester_settings_override_pair` requires
        // both columns set in manual mode — so repoint it at a real session instead. Prefer the
        // lowest-id non-probe session, which is the earliest calendar entry.
        const survivor = (
          await db
            .select({ id: academicSessions.id })
            .from(academicSessions)
            .orderBy(asc(academicSessions.id))
        ).find((s) => !leftoverSessions.some((probe) => probe.id === s.id));

        if (!survivor) {
          throw new Error(
            "The only academic_sessions rows left are probe rows from a previous run. There is " +
              "nothing to repoint the override at, so this needs a human. Run `pnpm db:flush:dev` " +
              "to rebuild the calendar, then re-run this script.",
          );
        }

        await db
          .update(semesterSettings)
          .set({
            mode: "manual",
            manualOverride: "harmattan",
            manualOverrideSessionId: survivor.id,
          })
          .where(eq(semesterSettings.id, 1));
        console.warn(
          `  repointed the semester override off probe session ` +
            `${settings?.manualOverrideSessionId} onto session ${survivor.id}`,
        );
      }
    }

    for (const course of leftoverCourses) {
      await db.delete(contentItems).where(eq(contentItems.courseId, course.id));
      await db.delete(courses).where(eq(courses.id, course.id));
    }
    for (const session of leftoverSessions) {
      await db.delete(academicSessions).where(eq(academicSessions.id, session.id));
    }
  }

  async function run(): Promise<void> {
    const students = await db
      .select({ userId: users.id, roleId: users.roleId })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(eq(roles.name, "student"))
      .orderBy(asc(users.id));

    if (students.length === 0) {
      throw new Error(
        "No student with a completed profile exists in this database, so the resource route " +
          "would answer 404 before reaching the filter this script is here to test.",
      );
    }
    const student = students[0];
    console.log(`student under test: userId=${student.userId} roleId=${student.roleId}`);

    await removeLeftovers();

    const allCourses = await db
      .select({
        id: courses.id,
        code: courses.code,
        semester: courses.semester,
        sessionId: courses.sessionId,
        scopeType: courses.scopeType,
        departmentId: courses.departmentId,
        facultyId: courses.facultyId,
        levelId: courses.levelId,
      })
      .from(courses)
      .orderBy(asc(courses.id));

    const baseSessionId = allCourses[0]?.sessionId;
    // Only look at courses in ONE session, so "harmattan course" and "rain course" are
    // comparable. Picking one from each session would let a course in an inactive session
    // masquerade as the Harmattan/Rain pair under test.
    const baseCourses = allCourses.filter((c) => c.sessionId === baseSessionId);
    const harmattanCourse = baseCourses.find((c) => c.semester === "harmattan");
    const rainCourse = baseCourses.find((c) => c.semester === "rain");
    if (!harmattanCourse || !rainCourse || baseSessionId === undefined) {
      throw new Error(
        `Need at least one Harmattan and one Rain course in the same session. Found ` +
          `${allCourses.map((c) => `${c.code}:${c.semester}@${c.sessionId}`).join(", ")}.`,
      );
    }

    const token = await signSession({ userId: student.userId, roleId: student.roleId });

    // Snapshot the global override BEFORE touching anything, so the `finally` can restore it.
    const [original] = await db
      .select({
        mode: semesterSettings.mode,
        manualOverride: semesterSettings.manualOverride,
        manualOverrideSessionId: semesterSettings.manualOverrideSessionId,
      })
      .from(semesterSettings)
      .where(eq(semesterSettings.id, 1));
    console.log(`semester_settings before: ${JSON.stringify(original)}`);

    const insertedIds: number[] = [];
    // `null` rather than a row, so the `finally` can tell "never created" from "created".
    let probeSession: { id: number } | null = null;
    let probeCourse: { id: number } | null = null;

    // Everything that writes happens inside this `try`. Creating the probe rows before it would
    // mean a throw between here and the `try` leaked them into the calendar.
    try {
      // A throwaway session so the session axis can be exercised. Far-future dates mean it can
      // never win an auto-resolution, so leaving it behind would be harmless — but it is deleted
      // regardless. `9000/01` satisfies the label CHECK and is visibly synthetic.
      [probeSession] = await db
        .insert(academicSessions)
        .values({
          label: PROBE_SESSION_LABEL,
          harmattanStart: "9000-10-01",
          harmattanEnd: "9001-02-28",
          rainStart: "9001-03-01",
          rainEnd: "9001-07-31",
        })
        .returning({ id: academicSessions.id });
      if (!probeSession) throw new Error("Could not create the throwaway probe session.");

      // Clones the Harmattan course's access scope so the probe course is reachable by the same
      // student — otherwise the probe would be hidden by the access conditions and a `hidden`
      // result would prove nothing.
      [probeCourse] = await db
        .insert(courses)
        .values({
          code: PROBE_COURSE_CODE,
          title: PROBE_COURSE_TITLE,
          levelId: harmattanCourse.levelId,
          semester: "harmattan",
          sessionId: probeSession.id,
          scopeType: harmattanCourse.scopeType,
          departmentId: harmattanCourse.departmentId,
          facultyId: harmattanCourse.facultyId,
        })
        .returning({ id: courses.id });
      if (!probeCourse) throw new Error("Could not create the throwaway probe course.");

      console.log(
        `courses: ${harmattanCourse.code} (harmattan) and ${rainCourse.code} (rain) in session ` +
          `${baseSessionId}; probe course ${probeCourse.id} in throwaway session ${probeSession.id}`,
      );

      const fixtures: {
        courseId: number;
        type: "video" | "pdf";
        value: string;
        semester: string;
        session: "base" | "probe";
      }[] = [
        {
          courseId: harmattanCourse.id,
          type: "video",
          value: "https://drive.google.com/file/d/P6VERIFY-HARMATTAN-VIDEO",
          semester: "harmattan",
          session: "base",
        },
        {
          courseId: harmattanCourse.id,
          type: "pdf",
          value: "p6verify/harmattan.pdf",
          semester: "harmattan",
          session: "base",
        },
        {
          courseId: rainCourse.id,
          type: "video",
          value: "https://drive.google.com/file/d/P6VERIFY-RAIN-VIDEO",
          semester: "rain",
          session: "base",
        },
        {
          courseId: rainCourse.id,
          type: "pdf",
          value: "p6verify/rain.pdf",
          semester: "rain",
          session: "base",
        },
        {
          courseId: probeCourse.id,
          type: "video",
          value: "https://drive.google.com/file/d/P6VERIFY-PROBE-VIDEO",
          semester: "harmattan",
          session: "probe",
        },
        {
          courseId: probeCourse.id,
          type: "pdf",
          value: "p6verify/probe.pdf",
          semester: "harmattan",
          session: "probe",
        },
      ];

      for (const fixture of fixtures) {
        const [row] = await db
          .insert(contentItems)
          .values({
            courseId: fixture.courseId,
            type: fixture.type,
            title: `${PREFIX} ${fixture.type} on ${fixture.semester} course`,
            bodyOrFileUrl: fixture.value,
            uploadedBy: student.userId,
          })
          .returning({ id: contentItems.id });
        insertedIds.push(row.id);
      }

      // The base scenario must pin the session the two fixtures actually live in, not whatever
      // session the environment happened to have active when the script started.
      const baseSession = baseSessionId;
      const probeSessionId = probeSession.id;

      const setActive = async (
        semester: "harmattan" | "rain",
        session: "base" | "probe",
      ): Promise<void> => {
        await db
          .update(semesterSettings)
          .set({
            mode: "manual",
            manualOverride: semester,
            manualOverrideSessionId: session === "base" ? baseSession : probeSessionId,
          })
          .where(eq(semesterSettings.id, 1));
      };

      const runRoute = async (): Promise<VerificationRow[]> => {
        const response = await GET(
          new Request("http://localhost/api/resources", {
            headers: { authorization: `Bearer ${token}` },
          }),
        );
        if (response.status !== 200) {
          throw new Error(
            `GET /api/resources returned ${response.status}: ${await response.text()}`,
          );
        }
        const body = (await response.json()) as { data: VerificationRow[] };
        return body.data.filter((row) => row.title.startsWith(PREFIX));
      };

      // Videos are always visible. PDFs obey BOTH axes: they need their own semester *and* their
      // own session to be the active one.
      //
      // Fixture order matches `fixtures` above:
      //   0 H.video(base/harmattan)  1 H.pdf(base/harmattan)
      //   2 R.video(base/rain)       3 R.pdf(base/rain)
      //   4 probe.video(probe/harmattan)  5 probe.pdf(probe/harmattan)
      const scenarios = [
        {
          label: "harmattan @ base session",
          semester: "harmattan",
          session: "base",
          expected: [true, true, true, false, true, false],
        },
        {
          label: "rain @ base session",
          semester: "rain",
          session: "base",
          expected: [true, false, true, true, true, false],
        },
        {
          label: "harmattan @ probe session",
          semester: "harmattan",
          session: "probe",
          expected: [true, false, true, false, true, true],
        },
      ] as const;

      const failures: string[] = [];

      for (const scenario of scenarios) {
        await setActive(scenario.semester, scenario.session);
        const seen = await runRoute();
        console.log(`\n=== active: ${scenario.label} ===`);
        fixtures.forEach((fixture, index) => {
          const visible = seen.some((row) => row.id === insertedIds[index]);
          const where = `${fixture.type} on ${fixture.semester}/${fixture.session}`;
          console.log(`  ${where.padEnd(30)} -> ${visible ? "VISIBLE" : "hidden"}`);
          const want = scenario.expected[index];
          if (visible !== want) {
            failures.push(
              `active=${scenario.label}: ${where} was expected to be ` +
                `${want ? "visible" : "hidden"} but was ${visible ? "visible" : "hidden"}`,
            );
          }
        });
      }

      const total = fixtures.length * scenarios.length;
      if (failures.length > 0) {
        console.error(`\nFAIL — ${failures.length} of ${total} assertions failed:`);
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exitCode = 1;
        return;
      }
      console.log(
        `\nPASS — all ${total} assertions held. Every video stayed visible across all three ` +
          `scenarios, while each PDF disappeared exactly when either its semester or its session ` +
          `stopped being the active one.`,
      );
    } finally {
      for (const id of insertedIds) {
        await db.delete(contentItems).where(eq(contentItems.id, id));
      }

      // Order matters, and it is the reverse of creation. `academic_sessions.id` is referenced by
      // BOTH `courses.session_id` and `semester_settings.manual_override_session_id`, and the
      // last scenario leaves the override pointing at the probe session — so the session row
      // cannot be deleted until both of those rows stop referencing it. Restoring the override
      // first also means a failure anywhere below leaves the calendar usable rather than pinned
      // to a session that is about to disappear.
      if (original) {
        await db
          .update(semesterSettings)
          .set({
            mode: original.mode,
            manualOverride: original.manualOverride,
            manualOverrideSessionId: original.manualOverrideSessionId,
          })
          .where(eq(semesterSettings.id, 1));
      }
      if (probeCourse) await db.delete(courses).where(eq(courses.id, probeCourse.id));
      if (probeSession)
        await db.delete(academicSessions).where(eq(academicSessions.id, probeSession.id));
      console.log(
        `cleanup: removed fixture ids ${insertedIds.join(", ") || "none"}, probe course ` +
          `${probeCourse?.id ?? "none"}, probe session ${probeSession?.id ?? "none"}, and restored ` +
          `semester_settings`,
      );
    }
  }
}

void main().catch((error: unknown) => {
  console.error("verification failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
