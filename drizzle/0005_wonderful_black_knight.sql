CREATE TABLE "tour_completions" (
	"user_id" integer NOT NULL,
	"tour_key" varchar(80) NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tour_completions_user_id_tour_key_pk" PRIMARY KEY("user_id","tour_key")
);
--> statement-breakpoint
ALTER TABLE "tour_completions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tour_completions" ADD CONSTRAINT "tour_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tour_completions_deny_public" ON "tour_completions" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);