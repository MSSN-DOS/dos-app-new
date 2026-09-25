CREATE TABLE "teacher_subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"course_id" integer,
	"jamb_subject_id" integer,
	CONSTRAINT "teacher_subjects_scope_check" CHECK ((course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "teacher_subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_jamb_subject_id_jamb_subjects_id_fk" FOREIGN KEY ("jamb_subject_id") REFERENCES "public"."jamb_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_subjects_user_course_unique" ON "teacher_subjects" USING btree ("user_id","course_id") WHERE "teacher_subjects"."course_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_subjects_user_subject_unique" ON "teacher_subjects" USING btree ("user_id","jamb_subject_id") WHERE "teacher_subjects"."jamb_subject_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "teacher_subjects_deny_public" ON "teacher_subjects" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);