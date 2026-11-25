ALTER TABLE "users" ALTER COLUMN "show_on_leaderboard" SET DEFAULT false;
--> statement-breakpoint
-- Nobody chose to appear: the old default put everyone on. Learners opt in from Achievements.
UPDATE "users" SET "show_on_leaderboard" = false;
