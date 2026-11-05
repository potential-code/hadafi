import { pgTable, uuid, text, timestamp, unique, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Cached translations of course content (course and unit names, lesson text,
 * exam and check-in questions) for Learn with Hana. Content is stored in
 * English only; each string is translated once per language through
 * potential-ai and kept here, shared by every learner. Ported from SMEEP's
 * translation_cache.
 *
 * `source` is the normalised English string (zero-width characters stripped,
 * spacing collapsed), so the same visible text always resolves to one row.
 */
export const tutorTranslations = pgTable(
  'tutor_translations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** 'catalogue' (names) or 'lesson' (content): different prompt briefs. */
    domain: text('domain').notNull(),
    /** ar | ur */
    lang: text('lang').notNull(),
    source: text('source').notNull(),
    target: text('target').notNull(),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
  },
  (t) => [unique().on(t.domain, t.lang, t.source), index('tutor_translations_lookup_idx').on(t.domain, t.lang)],
)

export type TutorTranslationRow = typeof tutorTranslations.$inferSelect
