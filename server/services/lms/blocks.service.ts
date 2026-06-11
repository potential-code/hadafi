import { db } from '../../db'
import { learningBlocks, blockQuestions } from '../../db/schema'
import { and, eq, sql } from 'drizzle-orm'
import type { LearningBlock, InsertBlockQuestion } from '../../db/schema'

/**
 * Creates a new learning block at the end of a unit's block list.
 * The count read and insert are wrapped in a transaction to prevent a race
 * condition where two concurrent creates could receive the same order value.
 *
 * @param unitId - UUID of the parent unit.
 * @param data   - Block fields excluding auto-generated id, unitId, order, and timestamps.
 */
export async function createBlock(
  unitId: string,
  data: Omit<LearningBlock, 'id' | 'unitId' | 'order' | 'createdAt' | 'updatedAt'>,
) {
  return db.transaction(async tx => {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(learningBlocks).where(eq(learningBlocks.unitId, unitId))
    const [block] = await tx.insert(learningBlocks)
      .values({ unitId, ...data, order: Number(count) })
      .returning()
    // Return with empty questions array so the response shape matches getCourse output
    return { ...block, questions: [] }
  })
}

/**
 * Updates mutable fields on a learning block and bumps `updatedAt`.
 *
 * @param blockId - UUID of the block to update.
 * @param data    - Partial block fields to merge (id, unitId, createdAt excluded).
 */
export async function updateBlock(
  blockId: string,
  data: Partial<Omit<LearningBlock, 'id' | 'unitId' | 'createdAt'>>,
) {
  const [block] = await db.update(learningBlocks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(learningBlocks.id, blockId))
    .returning()
  return block ?? null
}

/**
 * Deletes a learning block. Associated block questions cascade via FK.
 *
 * @param blockId - UUID of the block to delete.
 */
export async function deleteBlock(blockId: string) {
  await db.delete(learningBlocks).where(eq(learningBlocks.id, blockId))
}

/**
 * Reorders blocks within a unit by reassigning sequential `order` values.
 * All updates run inside a single transaction to avoid partial reorders.
 *
 * @param unitId - UUID of the parent unit.
 * @param ids    - Ordered array of block UUIDs reflecting the desired position.
 */
export async function reorderBlocks(unitId: string, ids: string[]) {
  await db.transaction(async tx => {
    for (let i = 0; i < ids.length; i++) {
      // Scope the update to the parent unit so IDs from a different unit
      // cannot silently reorder unrelated blocks (SECURITY: parent-scoped write).
      await tx.update(learningBlocks).set({ order: i, updatedAt: new Date() }).where(and(eq(learningBlocks.id, ids[i]), eq(learningBlocks.unitId, unitId)))
    }
  })
}

/**
 * Creates a new question on a block of type 'question'.
 * Order is computed as the current question count so the new item appends.
 *
 * @param blockId - UUID of the parent block.
 * @param data    - Question fields excluding auto-generated id, blockId, order, and timestamps.
 */
export async function createBlockQuestion(
  blockId: string,
  data: Omit<InsertBlockQuestion, 'id' | 'blockId' | 'order' | 'createdAt' | 'updatedAt'>,
) {
  return db.transaction(async tx => {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(blockQuestions).where(eq(blockQuestions.blockId, blockId))
    const [q] = await tx.insert(blockQuestions)
      .values({ blockId, ...data, order: Number(count) })
      .returning()
    return q
  })
}

/**
 * Updates mutable fields on a block question and bumps `updatedAt`.
 *
 * @param questionId - UUID of the question to update.
 * @param data       - Partial question fields to merge.
 */
export async function updateBlockQuestion(
  questionId: string,
  data: Partial<Omit<InsertBlockQuestion, 'id' | 'blockId' | 'createdAt'>>,
) {
  const [q] = await db.update(blockQuestions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(blockQuestions.id, questionId))
    .returning()
  return q ?? null
}

/**
 * Deletes a block question.
 *
 * @param questionId - UUID of the question to delete.
 */
export async function deleteBlockQuestion(questionId: string) {
  await db.delete(blockQuestions).where(eq(blockQuestions.id, questionId))
}

/**
 * Reorders questions within a block by reassigning sequential `order` values.
 * All updates run inside a single transaction to avoid partial reorders.
 *
 * @param blockId - UUID of the parent block.
 * @param ids     - Ordered array of question UUIDs reflecting the desired position.
 */
export async function reorderBlockQuestions(blockId: string, ids: string[]) {
  await db.transaction(async tx => {
    for (let i = 0; i < ids.length; i++) {
      // Scope the update to the parent block so IDs from a different block
      // cannot silently reorder unrelated questions (SECURITY: parent-scoped write).
      await tx.update(blockQuestions).set({ order: i, updatedAt: new Date() }).where(and(eq(blockQuestions.id, ids[i]), eq(blockQuestions.blockId, blockId)))
    }
  })
}
