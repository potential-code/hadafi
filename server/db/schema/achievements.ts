import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Badges a learner has earned, kept once with the day they earned it. The
 * primary key (user, badge) makes awarding twice a no-op, so a badge can't be
 * farmed and its notification rings once.
 */
export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** A key from server/services/achievements.service.ts BADGES. */
    badge: text('badge').notNull(),
    earnedAt: timestamp('earned_at').notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badge] })],
)

export type UserBadge = typeof userBadges.$inferSelect
