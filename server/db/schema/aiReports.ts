import { pgTable, uuid, text, timestamp, index, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/** One line of the conversation kept with a report. */
export type AiReportTurn = { role: 'learner' | 'ai'; text: string }

/**
 * A learner's report of an AI answer (Ask Hana, an AI mentor…), ported from
 * SMEEP: the answer, the conversation just before it and the learner's
 * reason, for an admin to review on Admin → AI safety review.
 */
export const aiReports = pgTable(
  'ai_reports',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Kept when the account is deleted, so the report itself isn't lost. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Which AI: ask-hana, mentor:<slug>… */
    surface: text('surface').notNull(),
    /** wrong | harmful | inappropriate | unhelpful | other */
    reason: text('reason').notNull(),
    note: text('note'),
    /** The reported answer, as shown to the learner. */
    reply: text('reply').notNull(),
    /** sha256 of the reply, so a learner reports one answer once. */
    replyHash: text('reply_hash').notNull(),
    /** The learner's message it answered, when known. */
    question: text('question'),
    /** The turns before the answer (a few, trimmed). */
    excerpt: jsonb('excerpt').$type<AiReportTurn[]>().notNull().default(sql`'[]'::jsonb`),
    /** The reporter's own conversation it came from, scoped to her by the server. */
    conversationRef: text('conversation_ref'),
    /** The page it was reported from. */
    page: text('page'),
    /** new | reviewed | action_taken */
    status: text('status').notNull().default('new'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('ai_reports_status_created_idx').on(t.status, t.createdAt),
    uniqueIndex('ai_reports_user_reply_idx').on(t.userId, t.replyHash),
  ],
)

/** Admins' notes on a report (what they checked or changed). */
export const aiReportNotes = pgTable(
  'ai_report_notes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    reportId: uuid('report_id').notNull().references(() => aiReports.id, { onDelete: 'cascade' }),
    adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('ai_report_notes_report_idx').on(t.reportId, t.createdAt)],
)

export type AiReport = typeof aiReports.$inferSelect
