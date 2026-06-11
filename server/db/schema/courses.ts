import { pgTable, uuid, text, timestamp, integer, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const difficultyEnum = pgEnum('difficulty', ['Beginner', 'Intermediate', 'Advanced'])
export const courseStatusEnum = pgEnum('course_status', ['draft', 'published'])
export const blockTypeEnum = pgEnum('block_type', ['text', 'video', 'image', 'question'])
export const questionKindEnum = pgEnum('question_kind', ['survey', 'action-plan'])
export const questionFormatEnum = pgEnum('question_format', ['multiple-choice', 'true-false', 'short-text'])

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  description: text('description'),
  cover: text('cover'),
  difficulty: difficultyEnum('difficulty').notNull().default('Beginner'),
  pointsPerUnit: integer('points_per_unit').notNull().default(10),
  enableCertificate: boolean('enable_certificate').notNull().default(true),
  status: courseStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
})

export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
})

export const units = pgTable('units', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  durationMinutes: integer('duration_minutes'),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
})

export const learningBlocks = pgTable('learning_blocks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  unitId: uuid('unit_id').notNull().references(() => units.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  type: blockTypeEnum('type').notNull(),
  order: integer('order').notNull().default(0),
  body: text('body'),
  videoUrl: text('video_url'),
  transcript: text('transcript'),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
})

export const blockQuestions = pgTable('block_questions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  blockId: uuid('block_id').notNull().references(() => learningBlocks.id, { onDelete: 'cascade' }),
  kind: questionKindEnum('kind').notNull().default('survey'),
  format: questionFormatEnum('format').notNull().default('multiple-choice'),
  prompt: text('prompt').notNull(),
  options: text('options').array(),
  correctIndex: integer('correct_index'),
  correctBool: boolean('correct_bool'),
  placeholder: text('placeholder'),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
})

export type Course = typeof courses.$inferSelect
export type InsertCourse = typeof courses.$inferInsert
export type Module = typeof modules.$inferSelect
export type InsertModule = typeof modules.$inferInsert
export type Unit = typeof units.$inferSelect
export type InsertUnit = typeof units.$inferInsert
export type LearningBlock = typeof learningBlocks.$inferSelect
export type InsertLearningBlock = typeof learningBlocks.$inferInsert
export type BlockQuestion = typeof blockQuestions.$inferSelect
export type InsertBlockQuestion = typeof blockQuestions.$inferInsert
