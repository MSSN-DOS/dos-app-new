CREATE TYPE "public"."quiz_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."review_policy" AS ENUM('never', 'after_attempt', 'after_release');--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" integer NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "passages" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer,
	"jamb_subject_id" integer,
	"topic_id" integer,
	"title" varchar(200),
	"body_rich_text" text NOT NULL,
	"status" "status" DEFAULT 'draft' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "passages_track_check" CHECK ((course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "passages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "reason_rich_text" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "passage_id" integer;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "marks" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "time_limit_seconds" integer;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "visibility" "quiz_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "shuffle_questions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "shuffle_options" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "allow_resume" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "auto_next_question" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "require_login_to_attempt" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "show_answers_after" "review_policy" DEFAULT 'after_release' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "show_result_after" "review_policy" DEFAULT 'after_release' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "show_calculator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "deduct_marks_for_wrong" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_jamb_subject_id_jamb_subjects_id_fk" FOREIGN KEY ("jamb_subject_id") REFERENCES "public"."jamb_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_marks_check" CHECK (marks >= 0);--> statement-breakpoint
CREATE POLICY "user_preferences_deny_public" ON "user_preferences" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "passages_deny_public" ON "passages" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint

-- Backfill, not expressible in the Drizzle schema DSL (same precedent as 0001's REVOKE).
-- Every quiz that exists today was authored in whole minutes. Without this, a reader that
-- prefers time_limit_seconds would treat an already-timed quiz as untimed (`NULL`).
UPDATE "quizzes" SET "time_limit_seconds" = "time_limit_minutes" * 60 WHERE "time_limit_seconds" IS NULL;