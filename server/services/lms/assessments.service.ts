import { db } from '../../db'
import { assessments, assessmentQuestions } from '../../db/schema'
import { and, eq, sql } from 'drizzle-orm'
import type { InsertAssessment, InsertAssessmentQuestion } from '../../db/schema'

/**
 * Creates a new assessment (pre or post) for a course.
 *
 * @param courseId - UUID of the parent course.
 * @param data     - Assessment fields excluding auto-generated id, courseId, and timestamps.
 */
export async function createAssessment(
  courseId: string,
  data: Omit<InsertAssessment, 'id' | 'courseId' | 'createdAt' | 'updatedAt'>,
) {
  const [assessment] = await db.insert(assessments)
    .values({ courseId, ...data })
    .returning()
  // Return with empty questions array so the response shape is consistent
  return { ...assessment, questions: [] }
}

/**
 * Updates mutable fields on an assessment and bumps `updatedAt`.
 * `assessmentType` is excluded from updates — changing pre/post classification
 * requires deleting and recreating the assessment.
 *
 * @param assessmentId - UUID of the assessment to update.
 * @param data         - Partial assessment fields to merge.
 */
export async function updateAssessment(
  assessmentId: string,
  data: Partial<Omit<InsertAssessment, 'id' | 'courseId' | 'assessmentType' | 'createdAt'>>,
) {
  const [assessment] = await db.update(assessments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(assessments.id, assessmentId))
    .returning()
  return assessment ?? null
}

/**
 * Deletes an assessment. Associated questions cascade via FK.
 *
 * @param assessmentId - UUID of the assessment to delete.
 */
export async function deleteAssessment(assessmentId: string) {
  await db.delete(assessments).where(eq(assessments.id, assessmentId))
}

/**
 * Creates a new question on an assessment.
 * Order is computed as the current question count so the new item appends.
 *
 * @param assessmentId - UUID of the parent assessment.
 * @param data         - Question fields excluding auto-generated id, assessmentId, order, and timestamps.
 */
export async function createAssessmentQuestion(
  assessmentId: string,
  data: Omit<InsertAssessmentQuestion, 'id' | 'assessmentId' | 'order' | 'createdAt' | 'updatedAt'>,
) {
  return db.transaction(async tx => {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, assessmentId))
    const [q] = await tx.insert(assessmentQuestions)
      .values({ assessmentId, ...data, order: Number(count) })
      .returning()
    return q
  })
}

/**
 * Updates mutable fields on an assessment question and bumps `updatedAt`.
 *
 * @param questionId - UUID of the question to update.
 * @param data       - Partial question fields to merge.
 */
export async function updateAssessmentQuestion(
  questionId: string,
  data: Partial<Omit<InsertAssessmentQuestion, 'id' | 'assessmentId' | 'createdAt'>>,
) {
  const [q] = await db.update(assessmentQuestions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(assessmentQuestions.id, questionId))
    .returning()
  return q ?? null
}

/**
 * Deletes an assessment question.
 *
 * @param questionId - UUID of the question to delete.
 */
export async function deleteAssessmentQuestion(questionId: string) {
  await db.delete(assessmentQuestions).where(eq(assessmentQuestions.id, questionId))
}

/**
 * Reorders questions within an assessment by reassigning sequential `order` values.
 * All updates run inside a single transaction to avoid partial reorders.
 *
 * @param assessmentId - UUID of the parent assessment.
 * @param ids          - Ordered array of question UUIDs reflecting the desired position.
 */
export async function reorderAssessmentQuestions(assessmentId: string, ids: string[]) {
  await db.transaction(async tx => {
    for (let i = 0; i < ids.length; i++) {
      // Scope the update to the parent assessment so IDs from a different assessment
      // cannot silently reorder unrelated questions (SECURITY: parent-scoped write).
      await tx.update(assessmentQuestions).set({ order: i, updatedAt: new Date() }).where(and(eq(assessmentQuestions.id, ids[i]), eq(assessmentQuestions.assessmentId, assessmentId)))
    }
  })
}
