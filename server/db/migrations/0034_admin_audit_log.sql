CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" text NOT NULL,
	"key_label" text,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"target_ids" jsonb,
	"request_summary" jsonb,
	"ip" text,
	CONSTRAINT "admin_audit_log_actor_kind_check" CHECK ("admin_audit_log"."actor_kind" in ('session', 'operator_key'))
);
--> statement-breakpoint
CREATE INDEX "admin_audit_log_at_idx" ON "admin_audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_at_idx" ON "admin_audit_log" USING btree ("actor_user_id","at");