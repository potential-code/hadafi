CREATE TABLE "tutor_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"lang" text NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_translations_domain_lang_source_unique" UNIQUE("domain","lang","source")
);
--> statement-breakpoint
CREATE INDEX "tutor_translations_lookup_idx" ON "tutor_translations" USING btree ("domain","lang");