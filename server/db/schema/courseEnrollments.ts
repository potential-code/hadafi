import { pgTable, uuid, timestamp, pgEnum, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { courses } from './courses'

export const enrollmentStatusEnum = pgEnum('enrollment_status', ['active', 'completed', 'dropped'])

export const courseEnrollments = pgTable('course_enrollments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  status: enrollmentStatusEnum('status').notNull().default('active'),
  enrolledAt: timestamp('enrolled_at').notNull().default(sql`now()`),
  completedAt: timestamp('completed_at'),
}, (t) => [unique().on(t.userId, t.courseId)])

export type CourseEnrollment = typeof courseEnrollments.$inferSelect
export type InsertCourseEnrollment = typeof courseEnrollments.$inferInsert
