ALTER TABLE "mentor_sessions" DROP CONSTRAINT "mentor_sessions_mentor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "mentor_sessions" DROP CONSTRAINT "mentor_sessions_sme_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "mentor_sessions" ALTER COLUMN "status" SET DEFAULT 'confirmed';--> statement-breakpoint
ALTER TABLE "mentor_sessions" ADD CONSTRAINT "mentor_sessions_mentor_user_id_users_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_sessions" ADD CONSTRAINT "mentor_sessions_sme_user_id_users_id_fk" FOREIGN KEY ("sme_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_sessions_slot_idx" ON "mentor_sessions" USING btree ("slot_id");