import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Learner events waiting to be sent to the Potential CRM (services/crmSync).
 *
 * One row per event, written once and never edited: `payload` is the exact
 * JSON body the CRM receives, frozen when the event happened, so a retry
 * always sends the same thing. `event_key` (also the payload's submissionId)
 * makes each event unique: enqueueing it twice is a no-op.
 *
 * A row is pending while `sent_at` is null and `attempts` is under the drain's
 * limit; at the limit it has been given up on (kept, with `last_error`).
 * Deleting the learner deletes their rows, sent or not.
 */
export const crmOutbox = pgTable(
  'crm_outbox',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** hadafi:reg:<userId> | hadafi:act1:<userId> | hadafi:cert:<userId>:<courseId> | hadafi:consent:<userId>:<epochMs> */
    eventKey: text('event_key').notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().default(sql`now()`),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    // The drain's query: unsent rows that are due.
    index('crm_outbox_due_idx').on(t.nextAttemptAt).where(sql`${t.sentAt} is null`),
    index('crm_outbox_user_idx').on(t.userId),
  ],
)

export type CrmOutboxRow = typeof crmOutbox.$inferSelect
