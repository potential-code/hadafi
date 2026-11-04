import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * In-app notifications (the bell): one row per user per thing that happened:
 * a session booked or cancelled, a certificate earned, a new event or
 * recording, a reminder. `dedupeKey` makes each one fire once per user
 * (e.g. "session:<id>:reminder:24h"), so retries and the reminder timer never
 * repeat it.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** session_booked | session_cancelled | session_reminder | certificate | event_new | event_recording | course_nudge */
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** In-app path to open, e.g. /dashboard/sessions. */
    link: text('link'),
    dedupeKey: text('dedupe_key'),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
    readAt: timestamp('read_at'),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    uniqueIndex('notifications_user_dedupe_idx').on(t.userId, t.dedupeKey),
  ],
)

export type Notification = typeof notifications.$inferSelect
export type InsertNotification = typeof notifications.$inferInsert
