CREATE TABLE "question_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"object_path" varchar(500) NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "question_images_object_path_unique" UNIQUE("object_path")
);
--> statement-breakpoint
ALTER TABLE "question_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "bank_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "question_images" ADD CONSTRAINT "question_images_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "question_images_deny_public" ON "question_images" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);