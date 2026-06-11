import { pgTable, uuid, timestamp, integer, boolean, jsonb, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { assessments } from './assessments'

export const assessmentAttempts = pgTable('assessment_attempts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull().default(1),
  // stores { questionId: selectedAnswerIndex } for each answered question
  answers: jsonb('answers').$type<Record<string, number>>(),
  // score as 0-100 percent; null until graded
  score: integer('score'),
  // null for ungraded assessments
  passed: boolean('passed'),
  startedAt: timestamp('started_at').notNull().default(sql`now()`),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (t) => [unique().on(t.userId, t.assessmentId, t.attemptNumber)])

export type AssessmentAttempt = typeof assessmentAttempts.$inferSelect
export type InsertAssessmentAttempt = typeof assessmentAttempts.$inferInsert
