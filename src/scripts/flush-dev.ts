import fs from "node:fs";
import process from "node:process";

import postgres from "postgres";

const KEEP_IDENTIFIERS = [
  "ADM/2026/001",
  "STF-001",
  "21/30GN019",
  "21/30GN001",
  "12345678AB",
] as const;

const EXECUTE_FLAG = "--execute";
const CONFIRM_FLAG = "--confirm=FLUSH_DEV_DATA";

function loadEnvironment(): void {
  if (fs.existsSync(".env.local")) process.loadEnvFile?.(".env.local");
  if (fs.existsSync(".env")) process.loadEnvFile?.(".env");
}

function assertSafeExecution(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to flush while NODE_ENV=production.");
  }
  if (process.argv.includes(EXECUTE_FLAG) && process.argv.includes(CONFIRM_FLAG) === false) {
    throw new Error(`Destructive mode requires ${CONFIRM_FLAG}.`);
  }
}

type CountRow = { count: string };

async function main(): Promise<void> {
  loadEnvironment();
  assertSafeExecution();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

  const sql = postgres(databaseUrl, { prepare: false });
  try {
    await sql.begin(async (tx) => {
      await tx`
        CREATE TEMP TABLE flush_keep_users ON COMMIT DROP AS
        SELECT id, identifier
        FROM users
        WHERE identifier IN ${sql(KEEP_IDENTIFIERS)}
      `;

      const keepers = await tx<CountRow[]>`
        SELECT count(*)::text AS count FROM flush_keep_users
      `;
      if (Number(keepers[0]?.count ?? 0) !== KEEP_IDENTIFIERS.length) {
        throw new Error(
          `Flush aborted: expected ${KEEP_IDENTIFIERS.length} keeper users, found ${keepers[0]?.count ?? "0"}.`,
        );
      }

      const roles = await tx<{ identifier: string; role: string }[]>`
        SELECT u.identifier, r.name AS role
        FROM flush_keep_users k
        JOIN users u ON u.id = k.id
        JOIN roles r ON r.id = u.role_id
        ORDER BY u.identifier
      `;
      console.log("Keepers:", roles.map((row) => `${row.identifier} (${row.role})`).join(", "));

      const counts = await tx<{
        sessions: string;
        attempts: string;
        quizzes: string;
        questions: string;
        topics: string;
        content: string;
        users: string;
      }[]>`
        SELECT
          (SELECT count(*) FROM sessions)::text AS sessions,
          (SELECT count(*) FROM quiz_attempts)::text AS attempts,
          (SELECT count(*) FROM quizzes q WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = q.created_by))::text AS quizzes,
          (SELECT count(*) FROM questions q WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = q.created_by))::text AS questions,
          (SELECT count(*) FROM topics t WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = t.created_by))::text AS topics,
          (SELECT count(*) FROM content_items c WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = c.uploaded_by))::text AS content,
          (SELECT count(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = u.id))::text AS users
      `;
      console.log("Planned deletion counts:", counts[0]);

      if (!process.argv.includes(EXECUTE_FLAG)) {
        console.log(`Dry run only. Re-run with ${EXECUTE_FLAG} ${CONFIRM_FLAG} to execute.`);
        return;
      }

      await tx`DELETE FROM attempt_answers`;
      await tx`DELETE FROM quiz_attempts`;
      await tx`DELETE FROM best_scores`;
      await tx`DELETE FROM cgpa_records`;
      await tx`DELETE FROM post_utme_scores`;
      await tx`DELETE FROM sessions`;

      await tx`
        DELETE FROM quiz_questions qq
        WHERE EXISTS (
          SELECT 1 FROM quizzes q
          WHERE q.id = qq.quiz_id
          AND NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = q.created_by)
        )
        OR EXISTS (
          SELECT 1 FROM questions q
          WHERE q.id = qq.question_id
          AND NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = q.created_by)
        )
      `;
      await tx`
        DELETE FROM quizzes q
        WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = q.created_by)
      `;
      await tx`
        DELETE FROM questions q
        WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = q.created_by)
      `;
      await tx`
        DELETE FROM topics t
        WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = t.created_by)
      `;
      await tx`
        DELETE FROM content_items c
        WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = c.uploaded_by)
      `;
      await tx`UPDATE semester_settings SET updated_by = NULL WHERE updated_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = updated_by)`;
      await tx`
        DELETE FROM users u
        WHERE NOT EXISTS (SELECT 1 FROM flush_keep_users k WHERE k.id = u.id)
      `;

      console.log("Dev database flush committed. Sequences were intentionally left unchanged.");
    });
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("Dev flush failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
