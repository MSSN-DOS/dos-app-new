ALTER TABLE "quizzes" ADD COLUMN "opens_at" timestamp;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "closes_at" timestamp;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_window_check" CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at);