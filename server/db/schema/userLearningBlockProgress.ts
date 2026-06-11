import { pgTable, uuid, timestamp, integer, pgEnum, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { learningBlocks } from './courses'

export const blockProgressStatusEnum = pgEnum('block_progress_status', ['not_started', 'in_progress', 'completed'])

export const userLearningBlockProgress = pgTable('user_learning_block_progress', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  learningBlockId: uuid('learning_block_id').notNull().references(() => learningBlocks.id, { onDelete: 'cascade' }),
  status: blockProgressStatusEnum('status').notNull().default('not_started'),
  videoWatchPct: integer('video_watch_pct').default(0),
  completedAt: timestamp('completed_at'),
}, (t) => [unique().on(t.userId, t.learningBlockId)])

export type UserLearningBlockProgress = typeof userLearningBlockProgress.$inferSelect
export type InsertUserLearningBlockProgress = typeof userLearningBlockProgress.$inferInsert
