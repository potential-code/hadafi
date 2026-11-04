import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * A mentor's private running notes about one mentee (SME). One row per
 * mentor/mentee pair; only that mentor can read or write it.
 */
export const mentorMenteeNotes = pgTable(
  'mentor_mentee_notes',
  {
    mentorId: uuid('mentor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    menteeId: uuid('mentee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    notes: text('notes').notNull().default(''),
    updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.mentorId, t.menteeId] })],
)

export type MentorMenteeNote = typeof mentorMenteeNotes.$inferSelect
