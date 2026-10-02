CREATE TABLE "academic_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "academic_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"label" text NOT NULL,
	"harmattan_start" date NOT NULL,
	"harmattan_end" date NOT NULL,
	"rain_start" date NOT NULL,
	"rain_end" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "academic_sessions_label_key" UNIQUE("label"),
	CONSTRAINT "academic_sessions_label_format" CHECK (label ~ '^[0-9]{4}/[0-9]{2}$'),
	CONSTRAINT "academic_sessions_dates_ordered" CHECK (harmattan_start < harmattan_end
        AND harmattan_end < rain_start
        AND rain_start < rain_end)
);
--> statement-breakpoint
-- DATA MIGRATION (hand-written, not generated — read this before deploying).
--
-- Drizzle generated `ALTER TABLE courses ADD COLUMN session_id integer NOT NULL`, which cannot
-- run against a database that already has course rows: Postgres rejects a NOT NULL column with
-- no default on a non-empty table. The same applies to `semester_settings_override_pair` below —
-- an existing row saved in manual mode carries `manual_override` but no session id, so the new
-- CHECK would reject it. Both were confirmed against the live dev database before this edit.
--
-- So: add the columns nullable, seed the one session the app was already hardcoded to, point
-- existing rows at it, then tighten. The 2025/26 dates are copied verbatim from DESIGN.md §8's
-- static calendar, so this backfill preserves the behaviour the app has today rather than
-- inventing anything. An Admin can correct the dates, and add 2026/27, in
-- /admin/settings/semester.
--
-- This is a data migration: it writes to `courses` and `semester_settings` in every environment,
-- including production. No existing row is deleted or altered beyond the assignment above.
INSERT INTO "academic_sessions" ("label", "harmattan_start", "harmattan_end", "rain_start", "rain_end")
VALUES ('2025/26', '2025-10-20', '2026-02-06', '2026-02-23', '2026-07-03')
ON CONFLICT ("label") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "session_id" integer;
--> statement-breakpoint
-- Every pre-existing course belongs to 2025/26: it was the only session the app knew about.
UPDATE "courses" SET "session_id" = (SELECT "id" FROM "academic_sessions" WHERE "label" = '2025/26')
WHERE "session_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "courses" ALTER COLUMN "session_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "semester_settings" ADD COLUMN "manual_override_session_id" integer;
--> statement-breakpoint
-- A stored manual override meant a bare semester under the old model, where the year was implied
-- by the hardcoded calendar. Pin it to 2025/26, which is the same thing it pointed at before —
-- this preserves the Admin's intent rather than changing it.
UPDATE "semester_settings" SET "manual_override_session_id" = (SELECT "id" FROM "academic_sessions" WHERE "label" = '2025/26')
WHERE "mode" = 'manual' AND "manual_override" IS NOT NULL AND "manual_override_session_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_session_id_academic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "semester_settings" ADD CONSTRAINT "semester_settings_manual_override_session_id_academic_sessions_id_fk" FOREIGN KEY ("manual_override_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "semester_settings" ADD CONSTRAINT "semester_settings_override_pair" CHECK ((mode = 'manual' AND manual_override IS NOT NULL AND manual_override_session_id IS NOT NULL)
        OR (mode = 'auto' AND manual_override IS NULL AND manual_override_session_id IS NULL));
--> statement-breakpoint
ALTER TABLE "academic_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "academic_sessions_deny_public" ON "academic_sessions" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
