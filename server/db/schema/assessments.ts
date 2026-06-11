import { pgTable, uuid, text, timestamp, integer, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { courses } from './courses'

export const assessmentTypeEnum = pgEnum('assessment_type', ['pre', 'post'])
export const assessmentQuestionTypeEnum = pgEnum('assessment_question_type', ['multiple-choice', 'true-false'])

export const assessments = pgTable('assessments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  assessmentType: assessmentTypeEnum('assessment_type').notNull(),
  isGraded: boolean('is_graded').notNull().default(true),
  passingScore: integer('passing_score').notNull().default(70),
  showAnswers: boolean('show_answers').notNull().default(false),
  maxAttempts: integer('max_attempts').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
})

export const assessmentQuestions = pgTable('assessment_questions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  questionType: assessmentQuestionTypeEnum('question_type').notNull().default('multiple-choice'),
  questionText: text('question_text').notNull(),
  options: text('options').array().notNull().default(sql`ARRAY[]::text[]`),
  correctAnswer: integer('correct_answer').notNull().default(0),
  explanation: text('explanation'),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
})

export type Assessment = typeof assessments.$inferSelect
export type InsertAssessment = typeof assessments.$inferInsert
export type AssessmentQuestion = typeof assessmentQuestions.$inferSelect
export type InsertAssessmentQuestion = typeof assessmentQuestions.$inferInsert
