ALTER TABLE "user_learning_block_progress" ALTER COLUMN "video_watch_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_module_progress" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_user_id_assessment_id_attempt_number_unique" UNIQUE("user_id","assessment_id","attempt_number");--> statement-breakpoint
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_user_id_question_id_unique" UNIQUE("user_id","question_id");