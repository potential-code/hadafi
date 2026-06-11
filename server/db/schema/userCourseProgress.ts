import { pgTable, uuid, timestamp, integer, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { courses } from './courses'

export const userCourseProgress = pgTable('user_course_progress', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  progressPercentage: integer('progress_percentage').notNull().default(0),
  completedModules: integer('completed_modules').notNull().default(0),
  totalModules: integer('total_modules').notNull().default(0),
  startedAt: timestamp('started_at').notNull().default(sql`now()`),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (t) => [unique().on(t.userId, t.courseId)])

export type UserCourseProgress = typeof userCourseProgress.$inferSelect
export type InsertUserCourseProgress = typeof userCourseProgress.$inferInsert
