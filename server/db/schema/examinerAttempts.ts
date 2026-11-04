import { pgTable, uuid, text, integer, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { courses } from './courses'

/**
 * One marked AI Examiner attempt (Hana's mystery-shopper role-play, graded
 * against the chosen course). Ported from SMEEP's examiner_attempts.
 *
 * Every row is written by Hadafi's server from potential-ai's grader
 * (POST /api/examiner/grade): the transcript is read by potential-ai from the
 * learner's own exam thread and the score is the grader's. Nothing the
 * browser sends (a score, a scorecard, a transcript) is stored. Dimensions
 * are a flexible {key: score} map so the rubric can evolve without
 * migrations.
 *
 * `thread_id` is the exam's browser thread id: one exam is marked once
 * (unique per learner), so posting the same exam again returns its result.
 */
export const examinerAttempts = pgTable(
  'examiner_attempts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** The exam's CopilotKit thread id, as the page named it. */
    threadId: text('thread_id').notNull(),
    /** text | voice | video */
    mode: text('mode').notNull(),
    /** The scene card's title, e.g. "A customer asks about a late order". */
    scenario: text('scenario').notNull(),
    overallScore: integer('overall_score').notNull(),
    /** {courseKnowledge, application, communication, problemSolving, professionalism}, each 0-100 */
    dimensions: jsonb('dimensions').notNull().$type<Record<string, number>>(),
    strengths: jsonb('strengths').notNull().$type<string[]>(),
    improvements: jsonb('improvements').notNull().$type<string[]>(),
    feedback: text('feedback').notNull(),
    /** [{role: 'customer' | 'learner', text}], as potential-ai marked it */
    transcript: jsonb('transcript').notNull().$type<Array<{ role: string; text: string }>>(),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    index('examiner_attempts_user_created_idx').on(t.userId, t.createdAt),
    uniqueIndex('examiner_attempts_user_thread_uniq').on(t.userId, t.threadId),
  ],
)

export type ExaminerAttempt = typeof examinerAttempts.$inferSelect
export type InsertExaminerAttempt = typeof examinerAttempts.$inferInsert
