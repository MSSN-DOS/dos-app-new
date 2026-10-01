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
 * WHAT IT ASSERTS (2x2 = 8 assertions)
 *   active = Harmattan: harmattan video+pdf visible, rain video visible, rain pdf hidden
 *   active = Rain:      harmattan video visible, harmattan pdf HIDDEN, rain video+pdf visible
 * The two rows that must flip are the point: the same PDF goes from visible to hidden when the
 * active semester moves, while the video on that same course never does.
 *
 * SAFETY
 *   - Inserts 4 rows titled with the P6VERIFY prefix and deletes exactly those ids in a `finally`.
 *   - Snapshots `semester_settings` first and restores it in the same `finally`.
 *   - Refuses to run in production, like `flush-dev.ts`.
 *   - Exits non-zero if any assertion fails, so it is usable as a gate.
 *
 * Usage:  pnpm db:verify:video
 */

import fs from "node:fs";
import process from "node:process";

import { asc, eq } from "drizzle-orm";

const PREFIX = "P6VERIFY";

type VerificationRow = { id: number; type: string; title: string };

function loadEnvironment(): void {
  if (fs.existsSync(".env.local")) process.loadEnvFile?.(".env.local");
  if (fs.existsSync(".env")) process.loadEnvFile?.(".env");
}

function assertSafeExecution(): void {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run: this inserts and deletes rows in content_items and rewrites the " +
        "semester_settings override. Never point it at production.",
    );
  }
}

async function main(): Promise<void> {
  loadEnvironment();
  assertSafeExecution();

  const { getDb, getDbClient } = await import("../lib/db");
  const { contentItems } = await import("../lib/db/schema/content");
  const { courses } = await import("../lib/db/schema/courses");
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

    const allCourses = await db
      .select({
        id: courses.id,
        code: courses.code,
        semester: courses.semester,
        sessionId: courses.sessionId,
      })
      .from(courses)
      .orderBy(asc(courses.id));

    const harmattanCourse = allCourses.find((c) => c.semester === "harmattan");
    const rainCourse = allCourses.find((c) => c.semester === "rain");
    if (!harmattanCourse || !rainCourse) {
      throw new Error(
        `Need at least one Harmattan and one Rain course in the same session. Found ` +
          `${allCourses.map((c) => `${c.code}:${c.semester}`).join(", ")}.`,
      );
    }
    console.log(
      `courses: ${harmattanCourse.code} (harmattan) and ${rainCourse.code} (rain), session ${harmattanCourse.sessionId}`,
    );

    const token = await signSession({ userId: student.userId, roleId: student.roleId });

    const fixtures: { courseId: number; type: "video" | "pdf"; value: string; semester: string }[] = [
      {
        courseId: harmattanCourse.id,
        type: "video",
        value: "https://drive.google.com/file/d/P6VERIFY-HARMATTAN-VIDEO",
        semester: "harmattan",
      },
      { courseId: harmattanCourse.id, type: "pdf", value: "p6verify/harmattan.pdf", semester: "harmattan" },
      { courseId: rainCourse.id, type: "video", value: "https://drive.google.com/file/d/P6VERIFY-RAIN-VIDEO", semester: "rain" },
      { courseId: rainCourse.id, type: "pdf", value: "p6verify/rain.pdf", semester: "rain" },
    ];

    const insertedIds: number[] = [];

    const [original] = await db
      .select({
        mode: semesterSettings.mode,
        manualOverride: semesterSettings.manualOverride,
        manualOverrideSessionId: semesterSettings.manualOverrideSessionId,
      })
      .from(semesterSettings)
      .where(eq(semesterSettings.id, 1));
    console.log(`semester_settings before: ${JSON.stringify(original)}`);

    try {
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

      const sessionId = original?.manualOverrideSessionId ?? harmattanCourse.sessionId;

      const setActive = async (semester: "harmattan" | "rain"): Promise<void> => {
        await db
          .update(semesterSettings)
          .set({ mode: "manual", manualOverride: semester, manualOverrideSessionId: sessionId })
          .where(eq(semesterSettings.id, 1));
      };

      const runRoute = async (): Promise<VerificationRow[]> => {
        const response = await GET(
          new Request("http://localhost/api/resources", {
            headers: { authorization: `Bearer ${token}` },
          }),
        );
        if (response.status !== 200) {
          throw new Error(`GET /api/resources returned ${response.status}: ${await response.text()}`);
        }
        const body = (await response.json()) as { data: VerificationRow[] };
        return body.data.filter((row) => row.title.startsWith(PREFIX));
      };

      // Videos are always visible; PDFs obey the active semester.
      const expectations: Record<string, boolean[]> = {
        harmattan: [true, true, true, false],
        rain: [true, false, true, true],
      };

      const failures: string[] = [];

      for (const active of ["harmattan", "rain"] as const) {
        await setActive(active);
        const seen = await runRoute();
        console.log(`\n=== active semester: ${active} ===`);
        fixtures.forEach((fixture, index) => {
          const visible = seen.some((row) => row.id === insertedIds[index]);
          console.log(
            `  ${fixture.type.padEnd(5)} on ${fixture.semester.padEnd(9)} -> ${visible ? "VISIBLE" : "hidden"}`,
          );
          const want = expectations[active][index];
          if (visible !== want) {
            failures.push(
              `active=${active}: ${fixture.type} on the ${fixture.semester} course was expected to be ` +
                `${want ? "visible" : "hidden"} but was ${visible ? "visible" : "hidden"}`,
            );
          }
        });
      }

      const total = fixtures.length * 2;
      if (failures.length > 0) {
        console.error(`\nFAIL — ${failures.length} of ${total} assertions failed:`);
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exitCode = 1;
        return;
      }
      console.log(
        `\nPASS — all ${total} assertions held. Videos stayed visible across the semester change ` +
          `while the PDF on the inactive course disappeared.`,
      );
    } finally {
      for (const id of insertedIds) {
        await db.delete(contentItems).where(eq(contentItems.id, id));
      }
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
    console.log(
        `cleanup: removed fixture ids ${insertedIds.join(", ") || "none"} and restored semester_settings`,
      );
    }
  }
}

void main().catch((error: unknown) => {
  console.error("verification failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});