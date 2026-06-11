import { db } from '../../db'
import {
  courses, modules, units, learningBlocks, blockQuestions,
  assessments, assessmentQuestions, courseEnrollments,
} from '../../db/schema'
import { eq, desc, inArray, asc, count } from 'drizzle-orm'
import type { Course } from '../../db/schema'

/**
 * Returns all courses ordered by most recently updated, with real enrolled
 * learner counts from the course_enrollments table.
 */
export async function listCourses() {
  const result = await db.select().from(courses).orderBy(desc(courses.updatedAt))

  const enrollmentCounts = await db
    .select({ courseId: courseEnrollments.courseId, count: count() })
    .from(courseEnrollments)
    .groupBy(courseEnrollments.courseId)

  const countMap = new Map(enrollmentCounts.map(e => [e.courseId, Number(e.count)]))
  return result.map(c => ({ ...c, enrolled: countMap.get(c.id) ?? 0 }))
}

/**
 * Fetches a single course with its full nested structure:
 * modules → units → blocks (with questions) and assessments (with questions).
 *
 * Returns null if no course matches the given ID.
 *
 * @param courseId - UUID of the course to fetch.
 */
export async function getCourse(courseId: string) {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId))
  if (!course) return null

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

  // Only fetch block questions for blocks of type 'question'
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

  // Assemble nested structure in memory rather than using SQL JOINs to keep
  // query count predictable and avoid Cartesian product row explosion.
  const blocksWithQs = courseBlocks.map(b => ({
    ...b,
    questions: courseBlockQs.filter(q => q.blockId === b.id),
  }))

  const unitsWithBlocks = courseUnits.map(u => ({
    ...u,
    blocks: blocksWithQs.filter(b => b.unitId === u.id),
  }))

  const modulesWithUnits = courseModules.map(m => ({
    ...m,
    units: unitsWithBlocks.filter(u => u.moduleId === m.id),
  }))

  const assessmentsWithQs = courseAssessments.map(a => ({
    ...a,
    questions: courseAssessmentQs.filter(q => q.assessmentId === a.id),
  }))

  const [enrollmentRow] = await db
    .select({ count: count() })
    .from(courseEnrollments)
    .where(eq(courseEnrollments.courseId, courseId))

  return {
    ...course,
    enrolled: Number(enrollmentRow?.count ?? 0),
    modules: modulesWithUnits,
    preAssessment: assessmentsWithQs.find(a => a.assessmentType === 'pre') ?? null,
    postAssessment: assessmentsWithQs.find(a => a.assessmentType === 'post') ?? null,
  }
}

/**
 * Creates a new course with the given data and returns it with the placeholder
 * `enrolled` count.
 *
 * @param data - Course fields excluding auto-generated id and timestamps.
 */
export async function createCourse(data: Omit<typeof courses.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>) {
  const [course] = await db.insert(courses).values(data).returning()
  return { ...course, enrolled: 0 }
}

/**
 * Updates the specified fields on an existing course and bumps `updatedAt`.
 *
 * Returns the updated course, or null if no course with the given ID exists.
 *
 * @param courseId - UUID of the course to update.
 * @param data     - Partial course fields to merge (id, createdAt excluded).
 */
export async function updateCourse(courseId: string, data: Partial<Omit<Course, 'id' | 'createdAt'>>) {
  const [updated] = await db.update(courses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(courses.id, courseId))
    .returning()
  return updated ?? null
}

/**
 * Deletes a course and all its children (cascade defined in schema).
 *
 * @param courseId - UUID of the course to delete.
 */
export async function deleteCourse(courseId: string) {
  await db.delete(courses).where(eq(courses.id, courseId))
}
