CREATE TABLE "mentor_availability_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"sme_user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"meeting_link" text,
	"cancelled_by" text,
	"cancelled_at" timestamp,
	"booked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "meeting_link" text;--> statement-breakpoint
ALTER TABLE "mentor_availability_slots" ADD CONSTRAINT "mentor_availability_slots_mentor_user_id_users_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_sessions" ADD CONSTRAINT "mentor_sessions_slot_id_mentor_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."mentor_availability_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_sessions" ADD CONSTRAINT "mentor_sessions_mentor_user_id_users_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_sessions" ADD CONSTRAINT "mentor_sessions_sme_user_id_users_id_fk" FOREIGN KEY ("sme_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_avail_mentor_starts_idx" ON "mentor_availability_slots" USING btree ("mentor_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "mentor_sessions_mentor_status_idx" ON "mentor_sessions" USING btree ("mentor_user_id","status");--> statement-breakpoint
CREATE INDEX "mentor_sessions_sme_status_idx" ON "mentor_sessions" USING btree ("sme_user_id","status");