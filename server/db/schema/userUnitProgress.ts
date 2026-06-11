import { pgTable, uuid, timestamp, pgEnum, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { units } from './courses'

export const unitProgressStatusEnum = pgEnum('unit_progress_status', ['not_started', 'in_progress', 'completed'])

export const userUnitProgress = pgTable('user_unit_progress', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').notNull().references(() => units.id, { onDelete: 'cascade' }),
  status: unitProgressStatusEnum('status').notNull().default('not_started'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, (t) => [unique().on(t.userId, t.unitId)])

export type UserUnitProgress = typeof userUnitProgress.$inferSelect
export type InsertUserUnitProgress = typeof userUnitProgress.$inferInsert
