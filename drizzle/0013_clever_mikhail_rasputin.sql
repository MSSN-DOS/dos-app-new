ALTER TYPE "public"."question_type" ADD VALUE 'multi_answer';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'numeric';--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "numeric_answer" double precision;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "numeric_tolerance" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "numeric_unit" varchar(60) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "shuffle_options" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD COLUMN "selected_option_ids" jsonb;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "unpublished_at" timestamp;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_numeric_tolerance_check" CHECK (numeric_tolerance >= 0);--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_max_attempts_check" CHECK (max_attempts IS NULL OR max_attempts >= 2);