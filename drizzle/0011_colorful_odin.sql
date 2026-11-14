ALTER TYPE "public"."question_type" ADD VALUE 'essay';--> statement-breakpoint
CREATE TABLE "quiz_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"quiz_id" integer NOT NULL,
	"object_path" varchar(500) NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_images_object_path_unique" UNIQUE("object_path")
);
--> statement-breakpoint
ALTER TABLE "quiz_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attempt_answers" ALTER COLUMN "text_answer" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "time_limit_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "passages" ADD COLUMN "builder_quiz_id" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "builder_quiz_id" integer;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD COLUMN "awarded_marks" integer;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "draft_answers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "cover_image_path" varchar(500);--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "builder_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "schedule_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_images" ADD CONSTRAINT "quiz_images_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_images" ADD CONSTRAINT "quiz_images_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_builder_quiz_id_quizzes_id_fk" FOREIGN KEY ("builder_quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_builder_quiz_id_quizzes_id_fk" FOREIGN KEY ("builder_quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "quiz_images_deny_public" ON "quiz_images" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);