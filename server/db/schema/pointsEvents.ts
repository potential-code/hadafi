import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Every time a learner earns points, one row: what for (`reason`) and which
 * thing (`ref`, e.g. the unit id). One award per (user, reason, ref), so
 * awarding twice is a no-op and points can't be farmed by redoing a unit.
 */
export const pointsEvents = pgTable(
  'points_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** unit */
    reason: text('reason').notNull(),
    ref: text('ref').notNull(),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('points_events_user_reason_ref_idx').on(t.userId, t.reason, t.ref),
    index('points_events_user_created_idx').on(t.userId, t.createdAt),
  ],
)

export type PointsEvent = typeof pointsEvents.$inferSelect
