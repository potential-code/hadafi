import { pgTable, uuid, timestamp, integer, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { modules } from './courses'

export const userModuleProgress = pgTable('user_module_progress', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  progressPercentage: integer('progress_percentage').notNull().default(0),
  completedUnits: integer('completed_units').notNull().default(0),
  totalUnits: integer('total_units').notNull().default(0),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (t) => [unique().on(t.userId, t.moduleId)])

export type UserModuleProgress = typeof userModuleProgress.$inferSelect
export type InsertUserModuleProgress = typeof userModuleProgress.$inferInsert
