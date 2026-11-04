CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge" text NOT NULL,
	"earned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_pk" PRIMARY KEY("user_id","badge")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_on_leaderboard" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Points held that no ledger row accounts for (balance plus points spent on
-- offers, minus what the ledger already has) become one 'opening' event dated
-- when the account was made, so the all-time leaderboard matches what each
-- learner has earned. Not a 'unit' event: it never counts against the daily cap.
INSERT INTO "points_events" ("user_id", "reason", "ref", "amount", "created_at")
SELECT u."id", 'opening', 'opening', t.extra, u."created_at"
FROM "users" u
JOIN LATERAL (
  SELECT u."points"
    + COALESCE((SELECT sum(r."points_deducted") FROM "offer_redemptions" r WHERE r."user_id" = u."id"), 0)
    - COALESCE((SELECT sum(e."amount") FROM "points_events" e WHERE e."user_id" = u."id"), 0) AS extra
) t ON true
WHERE t.extra > 0
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Badges learners had already earned before this release, each dated when it
-- was reached. Quiet on purpose: no bell for past achievements. Must match
-- BADGES in server/services/achievements.service.ts. ON CONFLICT makes it safe
-- to run again.
WITH learners AS (
  SELECT "id" FROM "users" WHERE "role" = 'sme'
),
active AS (
  SELECT d."user_id", d."day",
         d."day" - (row_number() OVER (PARTITION BY d."user_id" ORDER BY d."day"))::int AS grp
  FROM "learner_activity_days" d JOIN learners l ON l."id" = d."user_id"
  WHERE d."steps" > 0
),
runs AS (
  SELECT "user_id", min("day") AS start_day, count(*) AS len FROM active GROUP BY "user_id", grp
),
certs AS (
  SELECT c."user_id", c."issued_at",
         row_number() OVER (PARTITION BY c."user_id" ORDER BY c."issued_at") AS n
  FROM "course_certificates" c JOIN learners l ON l."id" = c."user_id"
  WHERE c."status" = 'active'
),
attempts AS (
  SELECT aa."user_id", s."course_id", s."assessment_type", aa."score", aa."completed_at"
  FROM "assessment_attempts" aa
  JOIN "assessments" s ON s."id" = aa."assessment_id"
  JOIN learners l ON l."id" = aa."user_id"
  WHERE aa."completed_at" IS NOT NULL AND aa."score" IS NOT NULL
),
pre AS (
  SELECT DISTINCT ON ("user_id", "course_id") "user_id", "course_id", "score"
  FROM attempts WHERE "assessment_type" = 'pre' ORDER BY "user_id", "course_id", "completed_at"
),
earned AS (
  SELECT "user_id", 'first_step' AS badge, min("day")::timestamp AS at FROM active GROUP BY "user_id"
  UNION ALL
  SELECT "user_id", 'streak_7', min(start_day + 6)::timestamp FROM runs WHERE len >= 7 GROUP BY "user_id"
  UNION ALL
  SELECT "user_id", 'streak_30', min(start_day + 29)::timestamp FROM runs WHERE len >= 30 GROUP BY "user_id"
  UNION ALL
  SELECT "user_id", 'course_1', "issued_at" FROM certs WHERE n = 1
  UNION ALL
  SELECT "user_id", 'course_3', "issued_at" FROM certs WHERE n = 3
  UNION ALL
  SELECT "user_id", 'top_marks', min("completed_at") FROM attempts WHERE "score" >= 100 GROUP BY "user_id"
  UNION ALL
  SELECT post."user_id", 'big_leap', min(post."completed_at")
  FROM attempts post JOIN pre ON pre."user_id" = post."user_id" AND pre."course_id" = post."course_id"
  WHERE post."assessment_type" = 'post' AND post."score" - pre."score" >= 20
  GROUP BY post."user_id"
  UNION ALL
  SELECT ms."sme_user_id", 'mentored', min(ms."updated_at")
  FROM "mentor_sessions" ms JOIN learners l ON l."id" = ms."sme_user_id"
  WHERE ms."status" = 'completed'
  GROUP BY ms."sme_user_id"
)
INSERT INTO "user_badges" ("user_id", "badge", "earned_at")
SELECT "user_id", badge, at FROM earned
ON CONFLICT DO NOTHING;
