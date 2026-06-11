import { pgTable, uuid, timestamp, jsonb, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { blockQuestions } from './courses'

export const questionAnswers = pgTable('question_answers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  questionId: uuid('question_id').notNull().references(() => blockQuestions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // stores the learner's response: either a selectedAnswer index or an openEndedAnswer string
  answerData: jsonb('answer_data').notNull().$type<{ selectedAnswer?: number; openEndedAnswer?: string }>(),
  submittedAt: timestamp('submitted_at').notNull().default(sql`now()`),
}, (t) => [unique().on(t.userId, t.questionId)])

export type QuestionAnswer = typeof questionAnswers.$inferSelect
export type InsertQuestionAnswer = typeof questionAnswers.$inferInsert
