import { db } from '../../db'
import {
  users, courses, modules, units, learningBlocks,
  assessments, assessmentAttempts,
  userLearningBlockProgress, userUnitProgress, userModuleProgress, userCourseProgress,
  questionAnswers,
} from '../../db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import type { UserLearningBlockProgress, UserUnitProgress, QuestionAnswer } from '../../db/schema'

/**
 * Upserts block-level progress for a learner.
 * If completing the block, propagates upward via recalculateFromBlock.
 * If starting the block, ensures the parent unit is at least 'in_progress'.
 *
 * @param userId        - UUID of the learner.
 * @param blockId       - UUID of the learning block.
 * @param status        - New progress status.
 * @param videoWatchPct - Optional video watch percentage to record.
 */
export async function updateBlockProgress(
  userId: string,
  blockId: string,
  status: 'not_started' | 'in_progress' | 'completed',
  videoWatchPct?: number,
): Promise<UserLearningBlockProgress> {
  const now = new Date()
  const updateSet: Partial<typeof userLearningBlockProgress.$inferInsert> = {
    status,
    ...(status === 'completed' ? { completedAt: now } : {}),
    ...(videoWatchPct !== undefined ? { videoWatchPct } : {}),
  }

  const [row] = await db.insert(userLearningBlockProgress)
    .values({ userId, learningBlockId: blockId, status, ...(status === 'completed' ? { completedAt: now } : {}), ...(videoWatchPct !== undefined ? { videoWatchPct } : {}) })
    .onConflictDoUpdate({
      target: [userLearningBlockProgress.userId, userLearningBlockProgress.learningBlockId],
      set: { ...updateSet, ...(videoWatchPct !== undefined ? { videoWatchPct } : {}) },
    })
    .returning()

  if (status === 'completed') {
    await recalculateFromBlock(userId, blockId)
  }

  if (status === 'in_progress') {
    const [block] = await db.select().from(learningBlocks).where(eq(learningBlocks.id, blockId))
    if (block) {
      const [existing] = await db.select().from(userUnitProgress)
        .where(and(eq(userUnitProgress.userId, userId), eq(userUnitProgress.unitId, block.unitId)))
      if (!existing || existing.status === 'not_started') {
        await db.insert(userUnitProgress)
          .values({ userId, unitId: block.unitId, status: 'in_progress', startedAt: now })
          .onConflictDoUpdate({
            target: [userUnitProgress.userId, userUnitProgress.unitId],
            set: { status: 'in_progress', startedAt: now },
          })
      }
    }
  }

  return row
}

/**
 * Upserts unit-level progress for a learner.
 * On completion, triggers module and course recalculation and awards points.
 *
 * @param userId  - UUID of the learner.
 * @param unitId  - UUID of the unit.
 * @param status  - New progress status.
 */
export async function updateUnitProgress(
  userId: string,
  unitId: string,
  status: 'not_started' | 'in_progress' | 'completed',
): Promise<UserUnitProgress> {
  const now = new Date()

  const [existing] = await db.select().from(userUnitProgress)
    .where(and(eq(userUnitProgress.userId, userId), eq(userUnitProgress.unitId, unitId)))

  const wasAlreadyCompleted = existing?.status === 'completed'

  const updateSet: Partial<typeof userUnitProgress.$inferInsert> = { status }
  if (status === 'completed') {
    updateSet.completedAt = now
    if (!existing?.startedAt) updateSet.startedAt = now
  }
  if (status === 'in_progress') {
    if (!existing?.startedAt) updateSet.startedAt = now
  }

  const [row] = await db.insert(userUnitProgress)
    .values({ userId, unitId, status, ...(status === 'completed' ? { completedAt: now, startedAt: existing?.startedAt ?? now } : {}), ...(status === 'in_progress' ? { startedAt: existing?.startedAt ?? now } : {}) })
    .onConflictDoUpdate({
      target: [userUnitProgress.userId, userUnitProgress.unitId],
      set: updateSet,
    })
    .returning()

  if (status === 'completed') {
    const [unit] = await db.select().from(units).where(eq(units.id, unitId))
    if (unit) {
      const [module] = await db.select().from(modules).where(eq(modules.id, unit.moduleId))
      if (module) {
        await recalculateModuleProgress(userId, module.id)
        await recalculateCourseProgress(userId, module.courseId)
        if (!wasAlreadyCompleted) {
          await awardPointsForUnit(userId, module.courseId, unitId)
        }
      }
    }
  }

  return row
}

/**
 * Checks if all blocks in a unit are complete and propagates unit/module/course progress.
 *
 * @param userId           - UUID of the learner.
 * @param learningBlockId  - UUID of the block that was just completed.
 */
export async function recalculateFromBlock(userId: string, learningBlockId: string): Promise<void> {
  const [block] = await db.select().from(learningBlocks).where(eq(learningBlocks.id, learningBlockId))
  if (!block) return

  const allBlocks = await db.select().from(learningBlocks).where(eq(learningBlocks.unitId, block.unitId))
  if (allBlocks.length === 0) return

  const blockIds = allBlocks.map(b => b.id)
  const progressRows = await db.select().from(userLearningBlockProgress)
    .where(and(eq(userLearningBlockProgress.userId, userId), inArray(userLearningBlockProgress.learningBlockId, blockIds)))

  const completedCount = progressRows.filter(p => p.status === 'completed').length

  if (completedCount === allBlocks.length) {
    await updateUnitProgress(userId, block.unitId, 'completed')
  } else if (completedCount > 0) {
    const [existing] = await db.select().from(userUnitProgress)
      .where(and(eq(userUnitProgress.userId, userId), eq(userUnitProgress.unitId, block.unitId)))
    if (!existing || existing.status === 'not_started') {
      await updateUnitProgress(userId, block.unitId, 'in_progress')
    }
  }

  const [unit] = await db.select().from(units).where(eq(units.id, block.unitId))
  if (unit) {
    const [module] = await db.select().from(modules).where(eq(modules.id, unit.moduleId))
    if (module) {
      await recalculateModuleProgress(userId, module.id)
      await recalculateCourseProgress(userId, module.courseId)
    }
  }
}

/**
 * Recalculates and upserts module-level progress based on completed units.
 *
 * @param userId    - UUID of the learner.
 * @param moduleId  - UUID of the module.
 */
export async function recalculateModuleProgress(userId: string, moduleId: string): Promise<void> {
  const moduleUnits = await db.select().from(units).where(eq(units.moduleId, moduleId))
  if (moduleUnits.length === 0) return

  const unitIds = moduleUnits.map(u => u.id)
  const progressRows = await db.select().from(userUnitProgress)
    .where(and(eq(userUnitProgress.userId, userId), inArray(userUnitProgress.unitId, unitIds)))

  const completedUnits = progressRows.filter(p => p.status === 'completed').length
  const progressPercentage = Math.round((completedUnits / moduleUnits.length) * 100)

  const now = new Date()
  await db.insert(userModuleProgress)
    .values({
      userId,
      moduleId,
      progressPercentage,
      completedUnits,
      totalUnits: moduleUnits.length,
      ...(progressPercentage >= 100 ? { completedAt: now } : {}),
    })
    .onConflictDoUpdate({
      target: [userModuleProgress.userId, userModuleProgress.moduleId],
      set: {
        progressPercentage,
        completedUnits,
        totalUnits: moduleUnits.length,
        updatedAt: now,
        ...(progressPercentage >= 100 ? { completedAt: now } : {}),
      },
    })
}

/**
 * Recalculates and upserts course-level progress based on completed blocks (or units if no blocks).
 * Auto-issues certificate if progress reaches 100%.
 *
 * @param userId    - UUID of the learner.
 * @param courseId  - UUID of the course.
 */
export async function recalculateCourseProgress(userId: string, courseId: string): Promise<void> {
  const courseModules = await db.select().from(modules).where(eq(modules.courseId, courseId))
  const moduleIds = courseModules.map(m => m.id)

  const courseUnits = moduleIds.length
    ? await db.select().from(units).where(inArray(units.moduleId, moduleIds))
    : []
  const unitIds = courseUnits.map(u => u.id)

  const courseBlocks = unitIds.length
    ? await db.select().from(learningBlocks).where(inArray(learningBlocks.unitId, unitIds))
    : []

  const courseAssessments = await db.select().from(assessments).where(eq(assessments.courseId, courseId))
  const preAssessment = courseAssessments.find(a => a.assessmentType === 'pre') ?? null
  const postAssessment = courseAssessments.find(a => a.assessmentType === 'post') ?? null

  const assessmentBonus = (preAssessment ? 1 : 0) + (postAssessment ? 1 : 0)

  let totalItems: number
  let completedItems: number

  if (courseBlocks.length > 0) {
    totalItems = courseBlocks.length + assessmentBonus
    const blockIds = courseBlocks.map(b => b.id)
    const blockProgress = await db.select().from(userLearningBlockProgress)
      .where(and(eq(userLearningBlockProgress.userId, userId), inArray(userLearningBlockProgress.learningBlockId, blockIds)))
    completedItems = blockProgress.filter(p => p.status === 'completed').length
  } else {
    totalItems = courseUnits.length + assessmentBonus
    const unitProgress = await db.select().from(userUnitProgress)
      .where(and(eq(userUnitProgress.userId, userId), inArray(userUnitProgress.unitId, unitIds)))
    completedItems = unitProgress.filter(p => p.status === 'completed').length
  }

  // Count assessment completions toward total
  if (preAssessment) {
    const preAttempts = await db.select().from(assessmentAttempts)
      .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, preAssessment.id)))
    const preComplete = preAssessment.isGraded
      ? preAttempts.some(a => a.passed === true)
      : preAttempts.length > 0
    if (preComplete) completedItems += 1
  }

  if (postAssessment) {
    const postAttempts = await db.select().from(assessmentAttempts)
      .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, postAssessment.id)))
    const postComplete = postAssessment.isGraded
      ? postAttempts.some(a => a.passed === true)
      : postAttempts.length > 0
    if (postComplete) completedItems += 1
  }

  const progressPercentage = totalItems === 0 ? 0 : Math.min(100, Math.round((completedItems / totalItems) * 100))

  const moduleProgressRows = await db.select().from(userModuleProgress)
    .where(and(eq(userModuleProgress.userId, userId), inArray(userModuleProgress.moduleId, moduleIds)))
  const completedModules = moduleProgressRows.filter(p => p.progressPercentage >= 100).length

  const now = new Date()
  await db.insert(userCourseProgress)
    .values({
      userId,
      courseId,
      progressPercentage,
      completedModules,
      totalModules: courseModules.length,
      ...(progressPercentage >= 100 ? { completedAt: now } : {}),
    })
    .onConflictDoUpdate({
      target: [userCourseProgress.userId, userCourseProgress.courseId],
      set: {
        progressPercentage,
        completedModules,
        totalModules: courseModules.length,
        updatedAt: now,
        ...(progressPercentage >= 100 ? { completedAt: now } : {}),
      },
    })

  if (progressPercentage >= 100) {
    // Dynamic import breaks the circular dependency: certificate.service imports this file,
    // so a static import would create a cycle that Node/Bun resolves as undefined at load time.
    const { tryAutoIssueCertificate } = await import('./certificate.service')
    await tryAutoIssueCertificate(userId, courseId)
  }
}

/**
 * Upserts a learner's answer to a block question.
 *
 * @param userId     - UUID of the learner.
 * @param questionId - UUID of the block question.
 * @param answerData - The learner's response payload.
 */
export async function saveQuestionAnswer(
  userId: string,
  questionId: string,
  answerData: { selectedAnswer?: number; openEndedAnswer?: string },
): Promise<QuestionAnswer> {
  const [row] = await db.insert(questionAnswers)
    .values({ userId, questionId, answerData })
    .onConflictDoUpdate({
      target: [questionAnswers.userId, questionAnswers.questionId],
      set: { answerData, submittedAt: new Date() },
    })
    .returning()
  return row
}

/**
 * Awards course points to the learner for a newly completed unit.
 * Uses a SQL arithmetic expression to avoid a read-modify-write race.
 *
 * @param userId    - UUID of the learner.
 * @param courseId  - UUID of the course (to look up pointsPerUnit).
 * @param unitId    - UUID of the unit (used only for traceability; award is per-course config).
 */
export async function awardPointsForUnit(userId: string, courseId: string, unitId: string): Promise<void> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId))
  if (!course || !course.pointsPerUnit) return

  await db.update(users)
    .set({ points: sql`${users.points} + ${course.pointsPerUnit}` })
    .where(eq(users.id, userId))
}
