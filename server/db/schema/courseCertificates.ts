import { pgTable, uuid, text, timestamp, pgEnum, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { courses } from './courses'

export const certificateStatusEnum = pgEnum('certificate_status', ['active', 'inactive'])

export const courseCertificates = pgTable('course_certificates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  certificateNumber: text('certificate_number').notNull().unique(),
  issuedAt: timestamp('issued_at').notNull().default(sql`now()`),
  certificateUrl: text('certificate_url'),
  filePath: text('file_path'),
  status: certificateStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (t) => [unique().on(t.userId, t.courseId)])

export type CourseCertificate = typeof courseCertificates.$inferSelect
export type InsertCourseCertificate = typeof courseCertificates.$inferInsert
