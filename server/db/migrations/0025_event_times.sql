CREATE TABLE "event_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"match_key" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"first_joined_at" timestamp with time zone NOT NULL,
	"last_left_at" timestamp with time zone,
	"minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"zoom_registrant_id" text,
	"zoom_join_url" text,
	"zoom_status" text DEFAULT 'not_required' NOT NULL,
	"zoom_error" text
);
--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "timezone" text DEFAULT 'Asia/Dubai' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "legacy_time" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "time_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill (hand-written; the same rules as server/services/eventTimes.ts).
-- The old date (YYYY-MM-DD) plus the first time in the free-text time
-- ("5:00 PM / GST - UAE time", "5 pm", "17:00"), read as UAE time; events
-- were an hour long. When the time can't be read, or names another time zone,
-- or the date isn't a real date, the row is kept (noon on its date, or the
-- day it was created) and flagged for an admin. The original text is copied
-- to legacy_time, and date/time themselves are left untouched.
DO $$
DECLARE
  r record;
  ap text[];
  hm text[];
  hh int;
  mi int;
  d date;
  ok boolean;
BEGIN
  FOR r IN SELECT id, "date", "time", created_at FROM "live_events" LOOP
    ok := true;
    BEGIN
      IF r."date" !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'bad date'; END IF;
      d := to_date(r."date", 'YYYY-MM-DD');
      IF to_char(d, 'YYYY-MM-DD') <> r."date" THEN RAISE EXCEPTION 'bad date'; END IF;
    EXCEPTION WHEN others THEN
      d := r.created_at::date;
      ok := false;
    END;
    ap := regexp_match(coalesce(r."time", ''), '(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]');
    hm := regexp_match(coalesce(r."time", ''), '(\d{1,2}):(\d{2})');
    IF ap IS NOT NULL AND ap[1]::int BETWEEN 1 AND 12 AND coalesce(ap[2], '00')::int < 60 THEN
      hh := (ap[1]::int % 12) + CASE WHEN lower(ap[3]) = 'p' THEN 12 ELSE 0 END;
      mi := coalesce(ap[2], '00')::int;
    ELSIF hm IS NOT NULL AND hm[1]::int < 24 AND hm[2]::int < 60 THEN
      hh := hm[1]::int;
      mi := hm[2]::int;
    ELSE
      hh := 12;
      mi := 0;
      ok := false;
    END IF;
    IF coalesce(r."time", '') ~* '\m(EST|EDT|PST|PDT|CST|CDT|MST|MDT|GMT|UTC|BST|CET|CEST|EET|KSA|AST|IST|WAT|EAT|PKT|Riyadh|Cairo|London)\M' THEN
      ok := false;
    END IF;
    UPDATE "live_events" SET
      "starts_at" = (d + make_time(hh, mi, 0)) AT TIME ZONE 'Asia/Dubai',
      "ends_at" = ((d + make_time(hh, mi, 0)) AT TIME ZONE 'Asia/Dubai') + interval '60 minutes',
      "legacy_time" = r."time",
      "time_needs_review" = NOT ok
    WHERE id = r.id;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "live_events" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "live_events" ALTER COLUMN "ends_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "format" text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_meeting_id" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_join_url" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_passcode" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_error" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_last_meeting_uuid" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "attendance_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_live_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_live_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendance_event_key_idx" ON "event_attendance" USING btree ("event_id","match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvps_event_user_idx" ON "event_rsvps" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_rsvps_user_idx" ON "event_rsvps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_events_starts_at_idx" ON "live_events" USING btree ("starts_at");