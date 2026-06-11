import { db } from '../../db'
import {
  courses, modules, units, learningBlocks, blockQuestions,
  assessments, assessmentQuestions,
  courseEnrollments, userLearningBlockProgress, userUnitProgress,
  userModuleProgress, userCourseProgress, assessmentAttempts,
} from '../../db/schema'
import { eq, and, desc, inArray, asc, count, sql } from 'drizzle-orm'
import type {
  UserLearningBlockProgress, UserUnitProgress, UserModuleProgress, UserCourseProgress,
} from '../../db/schema'

/**
 * Returns all published courses with enrollment and progress info for the given user.
 *
 * @param userId - UUID of the learner.
 */
export async function getPublishedCourses(userId: string) {
  const allCourses = await db.select().from(courses)
    .where(eq(courses.status, 'published'))
    .orderBy(desc(courses.updatedAt))

  if (allCourses.length === 0) return []

  const courseIds = allCourses.map(c => c.id)

  const enrollments = await db.select().from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), inArray(courseEnrollments.courseId, courseIds)))

  const progressRows = await db.select().from(userCourseProgress)
    .where(and(eq(userCourseProgress.userId, userId), inArray(userCourseProgress.courseId, courseIds)))

  const enrolledCourseIds = new Set(enrollments.map(e => e.courseId))
  const progressMap = new Map(progressRows.map(p => [p.courseId, p.progressPercentage]))

  const enrolledCountRows = await db
    .select({ courseId: courseEnrollments.courseId, cnt: count() })
    .from(courseEnrollments)
    .where(inArray(courseEnrollments.courseId, courseIds))
    .groupBy(courseEnrollments.courseId)
  const enrolledCountMap = new Map(enrolledCountRows.map(r => [r.courseId, r.cnt]))

  return allCourses.map(c => ({
    ...c,
    isEnrolled: enrolledCourseIds.has(c.id),
    progressPercentage: progressMap.get(c.id) ?? 0,
    enrolledCount: enrolledCountMap.get(c.id) ?? 0,
  }))
}

/**
 * Fetches the full nested course structure for an enrolled learner, with per-item
 * progress rows attached and lock status computed.
 *
 * @param userId   - UUID of the learner.
 * @param courseId - UUID of the course.
 */
export async function getLearnerCourse(userId: string, courseId: string) {
  const [enrollment] = await db.select().from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId)))
  if (!enrollment) throw new Error('NOT_ENROLLED')

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId))
  if (!course) throw new Error('NOT_ENROLLED')

  const courseModules = await db.select().from(modules)
    .where(eq(modules.courseId, courseId)).orderBy(asc(modules.order))

  const moduleIds = courseModules.map(m => m.id)

  const courseUnits = moduleIds.length
    ? await db.select().from(units).where(inArray(units.moduleId, moduleIds)).orderBy(asc(units.order))
    : []

  const unitIds = courseUnits.map(u => u.id)

  const courseBlocks = unitIds.length
    ? await db.select().from(learningBlocks).where(inArray(learningBlocks.unitId, unitIds)).orderBy(asc(learningBlocks.order))
    : []

  const qBlockIds = courseBlocks.filter(b => b.type === 'question').map(b => b.id)

  const courseBlockQs = qBlockIds.length
    ? await db.select().from(blockQuestions).where(inArray(blockQuestions.blockId, qBlockIds)).orderBy(asc(blockQuestions.order))
    : []

  const courseAssessments = await db.select().from(assessments)
    .where(eq(assessments.courseId, courseId))

  const assessmentIds = courseAssessments.map(a => a.id)

  const courseAssessmentQs = assessmentIds.length
    ? await db.select().from(assessmentQuestions).where(inArray(assessmentQuestions.assessmentId, assessmentIds)).orderBy(asc(assessmentQuestions.order))
    : []

  // Fetch all progress rows for this user in one pass per table
  const blockIds = courseBlocks.map(b => b.id)

  const [blockProgressRows, unitProgressRows, moduleProgressRows, courseProgressRows] = await Promise.all([
    blockIds.length
      ? db.select().from(userLearningBlockProgress)
        .where(and(eq(userLearningBlockProgress.userId, userId), inArray(userLearningBlockProgress.learningBlockId, blockIds)))
      : Promise.resolve([] as UserLearningBlockProgress[]),
    unitIds.length
      ? db.select().from(userUnitProgress)
        .where(and(eq(userUnitProgress.userId, userId), inArray(userUnitProgress.unitId, unitIds)))
      : Promise.resolve([] as UserUnitProgress[]),
    moduleIds.length
      ? db.select().from(userModuleProgress)
        .where(and(eq(userModuleProgress.userId, userId), inArray(userModuleProgress.moduleId, moduleIds)))
      : Promise.resolve([] as UserModuleProgress[]),
    db.select().from(userCourseProgress)
      .where(and(eq(userCourseProgress.userId, userId), eq(userCourseProgress.courseId, courseId))),
  ])

  const blockProgressMap = new Map(blockProgressRows.map(p => [p.learningBlockId, p]))
  const unitProgressMap = new Map(unitProgressRows.map(p => [p.unitId, p]))
  const moduleProgressMap = new Map(moduleProgressRows.map(p => [p.moduleId, p]))

  const blocksWithProgress = courseBlocks.map(b => ({
    ...b,
    questions: courseBlockQs.filter(q => q.blockId === b.id),
    blockProgress: blockProgressMap.get(b.id) ?? null,
    isLocked: false,
  }))

  const unitsWithBlocks = courseUnits.map(u => ({
    ...u,
    blocks: blocksWithProgress.filter(b => b.unitId === u.id),
    unitProgress: unitProgressMap.get(u.id) ?? null,
    isLocked: false,
  }))

  const modulesWithUnits = courseModules.map(m => ({
    ...m,
    units: unitsWithBlocks.filter(u => u.moduleId === m.id),
    moduleProgress: moduleProgressMap.get(m.id) ?? null,
    isLocked: false,
  }))

  const assessmentsWithQs = courseAssessments.map(a => ({
    ...a,
    questions: courseAssessmentQs.filter(q => q.assessmentId === a.id),
    isLocked: false,
    isCompleted: false,
  }))

  const result = {
    ...course,
    isEnrolled: true,
    progressPercentage: courseProgressRows[0]?.progressPercentage ?? 0,
    modules: modulesWithUnits,
    preAssessment: (assessmentsWithQs.find(a => a.assessmentType === 'pre') ?? null) as (typeof assessmentsWithQs[0] | null),
    postAssessment: (assessmentsWithQs.find(a => a.assessmentType === 'post') ?? null) as (typeof assessmentsWithQs[0] | null),
    courseProgress: courseProgressRows[0] ?? null,
  }

  await computeLockStatus(userId, result)

  return result
}

/**
 * Enrolls a user in a published course.
 * Throws descriptive errors for all failure conditions so the controller
 * can map them to appropriate HTTP responses.
 *
 * @param userId   - UUID of the learner.
 * @param courseId - UUID of the course.
 */
export async function enrollUser(userId: string, courseId: string) {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId))
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.status !== 'published') throw new Error('COURSE_NOT_PUBLISHED')

  const [existing] = await db.select().from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId)))
  if (existing) throw new Error('ALREADY_ENROLLED')

  const [enrollment] = await db.insert(courseEnrollments)
    .values({ userId, courseId, status: 'active' })
    .returning()

  return enrollment
}

/**
 * Mutates courseData in place, setting isLocked on each assessment, module, unit, and block.
 *
 * Lock algorithm:
 * - Pre-assessment is never locked.
 * - Modules are locked until the pre-assessment is complete.
 * - Units and blocks are locked sequentially — each item unlocks only after the previous is done.
 * - Post-assessment is locked until all units across all modules are complete.
 *
 * @param userId     - UUID of the learner (used for assessment attempt lookups).
 * @param courseData - The assembled course object returned by getLearnerCourse (mutated in place).
 */
// TODO: re-enable locking for production
const LOCK_DISABLED_FOR_TESTING = false

export async function computeLockStatus(userId: string, courseData: {
  preAssessment: { id: string; isGraded: boolean; isLocked: boolean; isCompleted: boolean } | null,
  postAssessment: { id: string; isGraded: boolean; isLocked: boolean } | null,
  modules: Array<{
    isLocked: boolean,
    units: Array<{
      isLocked: boolean,
      unitProgress: UserUnitProgress | null,
      blocks: Array<{
        isLocked: boolean,
        blockProgress: UserLearningBlockProgress | null,
      }>,
    }>,
  }>,
}): Promise<void> {
  if (LOCK_DISABLED_FOR_TESTING) {
    if (courseData.preAssessment) {
      courseData.preAssessment.isLocked = false
      courseData.preAssessment.isCompleted = true
    }
    for (const mod of courseData.modules) {
      mod.isLocked = false
      for (const unit of mod.units) {
        unit.isLocked = false
        for (const block of unit.blocks) {
          block.isLocked = false
        }
      }
    }
    if (courseData.postAssessment) courseData.postAssessment.isLocked = false
    return
  }

  let isPreComplete: boolean

  if (!courseData.preAssessment) {
    isPreComplete = true
  } else {
    courseData.preAssessment.isLocked = false
    const preAttempts = await db.select().from(assessmentAttempts)
      .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, courseData.preAssessment.id)))
    isPreComplete = courseData.preAssessment.isGraded
      ? preAttempts.some(a => a.passed === true)
      : preAttempts.length > 0
    courseData.preAssessment.isCompleted = isPreComplete
  }

  let allPreviousComplete = isPreComplete

  for (const mod of courseData.modules) {
    mod.isLocked = !isPreComplete

    for (const unit of mod.units) {
      unit.isLocked = !allPreviousComplete
      let prevBlockComplete = allPreviousComplete

      for (const block of unit.blocks) {
        block.isLocked = !prevBlockComplete
        prevBlockComplete = prevBlockComplete && block.blockProgress?.status === 'completed'
      }

      const unitIsComplete = unit.unitProgress?.status === 'completed'
        || (unit.blocks.length > 0 && unit.blocks.every(b => b.blockProgress?.status === 'completed'))
      allPreviousComplete = allPreviousComplete && unitIsComplete
    }
  }

  if (courseData.postAssessment) {
    courseData.postAssessment.isLocked = !allPreviousComplete
  }
}
