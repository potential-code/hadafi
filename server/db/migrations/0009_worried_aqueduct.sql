CREATE TYPE "public"."live_event_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "live_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'Webinar' NOT NULL,
	"track" text,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"meeting_link" text,
	"recording_link" text,
	"cover_image" text,
	"status" "live_event_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_events" ADD CONSTRAINT "live_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;