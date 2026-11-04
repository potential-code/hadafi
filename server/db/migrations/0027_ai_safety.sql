CREATE TABLE "ai_report_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"admin_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"surface" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"reply" text NOT NULL,
	"reply_hash" text NOT NULL,
	"question" text,
	"excerpt" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conversation_ref" text,
	"page" text,
	"status" text DEFAULT 'new' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_report_notes" ADD CONSTRAINT "ai_report_notes_report_id_ai_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."ai_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report_notes" ADD CONSTRAINT "ai_report_notes_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_report_notes_report_idx" ON "ai_report_notes" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_reports_status_created_idx" ON "ai_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_reports_user_reply_idx" ON "ai_reports" USING btree ("user_id","reply_hash");