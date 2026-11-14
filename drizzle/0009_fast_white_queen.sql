ALTER TABLE "users" ADD COLUMN "matric_number" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "jamb_reg_number" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_matric_number_unique" UNIQUE("matric_number");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_jamb_reg_number_unique" UNIQUE("jamb_reg_number");