CREATE TYPE "public"."status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('pdf', 'article');--> statement-breakpoint
CREATE TYPE "public"."identifier_type" AS ENUM('matric_number', 'jamb_reg_number', 'staff_id');--> statement-breakpoint
CREATE TYPE "public"."lose_focus_policy" AS ENUM('ignore', 'warn', 'auto_submit');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('fill_in_gap', 'options');--> statement-breakpoint
CREATE TYPE "public"."quiz_type" AS ENUM('topic', 'course');--> statement-breakpoint
CREATE TYPE "public"."role_name" AS ENUM('admin', 'teacher', 'student', 'aspirant');--> statement-breakpoint
CREATE TYPE "public"."scope_type" AS ENUM('department', 'faculty', 'general', 'interfaculty');--> statement-breakpoint
CREATE TYPE "public"."semester" AS ENUM('harmattan', 'rain');--> statement-breakpoint
CREATE TYPE "public"."semester_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "role_name" NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"identifier" varchar(50) NOT NULL,
	"identifier_type" "identifier_type" NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "department_levels" (
	"department_id" integer NOT NULL,
	"level_id" integer NOT NULL,
	CONSTRAINT "department_levels_department_id_level_id_pk" PRIMARY KEY("department_id","level_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"faculty_id" integer NOT NULL,
	"name" varchar(150) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faculties" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	CONSTRAINT "faculties_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "levels_value_unique" UNIQUE("value")
);
--> statement-breakpoint
CREATE TABLE "aspirant_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"aspiration_department_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"level_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_faculties" (
	"course_id" integer NOT NULL,
	"faculty_id" integer NOT NULL,
	CONSTRAINT "course_faculties_course_id_faculty_id_pk" PRIMARY KEY("course_id","faculty_id")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"level_id" integer NOT NULL,
	"semester" "semester" NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"department_id" integer,
	"faculty_id" integer,
	CONSTRAINT "courses_scope_check" CHECK ((scope_type = 'department' AND department_id IS NOT NULL AND faculty_id IS NULL) OR (scope_type = 'faculty' AND faculty_id IS NOT NULL AND department_id IS NULL) OR (scope_type IN ('general', 'interfaculty') AND department_id IS NULL AND faculty_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jamb_subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_blanks" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"blank_index" integer DEFAULT 1 NOT NULL,
	"accepted_answer" varchar(255) NOT NULL,
	"case_sensitive" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"option_text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer,
	"jamb_subject_id" integer,
	"topic_id" integer,
	"question_type" "question_type" NOT NULL,
	"body_rich_text" text NOT NULL,
	"status" "status" DEFAULT 'draft' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "questions_track_check" CHECK ((course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"attempt_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"selected_option_id" integer,
	"text_answer" varchar(255),
	"is_correct" boolean
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"quiz_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"score" numeric(6, 2),
	"started_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp,
	"released_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"quiz_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	CONSTRAINT "quiz_questions_quiz_id_question_id_pk" PRIMARY KEY("quiz_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"instructions" text,
	"quiz_type" "quiz_type" NOT NULL,
	"course_id" integer,
	"topic_id" integer,
	"jamb_subject_id" integer,
	"week_start" date,
	"question_count" integer DEFAULT 50 NOT NULL,
	"time_limit_minutes" integer NOT NULL,
	"pass_mark" integer NOT NULL,
	"allow_multiple_attempts" boolean DEFAULT false NOT NULL,
	"lose_focus_policy" "lose_focus_policy" DEFAULT 'ignore' NOT NULL,
	"status" "status" DEFAULT 'draft' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_track_check" CHECK ((course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL)),
	CONSTRAINT "quizzes_type_check" CHECK ((quiz_type = 'topic' AND topic_id IS NOT NULL AND week_start IS NULL) OR (quiz_type = 'course' AND topic_id IS NULL AND week_start IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "best_scores" (
	"user_id" integer NOT NULL,
	"quiz_id" integer NOT NULL,
	"best_score" numeric(6, 2) NOT NULL,
	"achieved_at" timestamp NOT NULL,
	CONSTRAINT "best_scores_user_id_quiz_id_pk" PRIMARY KEY("user_id","quiz_id")
);
--> statement-breakpoint
CREATE TABLE "cgpa_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"cgpa_value" numeric(4, 2) NOT NULL,
	CONSTRAINT "cgpa_records_user_week" UNIQUE("user_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "post_utme_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"raw_score" numeric(6, 2) NOT NULL,
	"converted_score_50" numeric(4, 2) NOT NULL,
	CONSTRAINT "post_utme_scores_user_week" UNIQUE("user_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "semester_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"mode" "semester_mode" DEFAULT 'auto' NOT NULL,
	"manual_override" "semester",
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	CONSTRAINT "semester_settings_single_row" CHECK (id = 1)
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "content_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body_or_file_url" text NOT NULL,
	"course_id" integer,
	"jamb_subject_id" integer,
	"uploaded_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "content_items_track_check" CHECK ((course_id IS NOT NULL AND jamb_subject_id IS NULL) OR (course_id IS NULL AND jamb_subject_id IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_levels" ADD CONSTRAINT "department_levels_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_levels" ADD CONSTRAINT "department_levels_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aspirant_profiles" ADD CONSTRAINT "aspirant_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aspirant_profiles" ADD CONSTRAINT "aspirant_profiles_aspiration_department_id_departments_id_fk" FOREIGN KEY ("aspiration_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_faculties" ADD CONSTRAINT "course_faculties_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_faculties" ADD CONSTRAINT "course_faculties_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_blanks" ADD CONSTRAINT "question_blanks_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_jamb_subject_id_jamb_subjects_id_fk" FOREIGN KEY ("jamb_subject_id") REFERENCES "public"."jamb_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."question_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_jamb_subject_id_jamb_subjects_id_fk" FOREIGN KEY ("jamb_subject_id") REFERENCES "public"."jamb_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_scores" ADD CONSTRAINT "best_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_scores" ADD CONSTRAINT "best_scores_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cgpa_records" ADD CONSTRAINT "cgpa_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_utme_scores" ADD CONSTRAINT "post_utme_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semester_settings" ADD CONSTRAINT "semester_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_jamb_subject_id_jamb_subjects_id_fk" FOREIGN KEY ("jamb_subject_id") REFERENCES "public"."jamb_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;