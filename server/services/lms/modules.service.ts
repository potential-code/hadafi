import { db } from '../../db'
import { modules } from '../../db/schema'
import { and, eq, sql } from 'drizzle-orm'

/**
 * Creates a new module at the end of a course's module list.
 * The count read and insert are wrapped in a transaction to prevent a race
 * condition where two concurrent creates could receive the same order value.
 *
 * @param courseId - UUID of the parent course.
 * @param data     - Module title and optional description.
 */
export async function createModule(courseId: string, data: { title: string; description?: string }) {
  return db.transaction(async tx => {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(modules).where(eq(modules.courseId, courseId))
    const [mod] = await tx.insert(modules)
      .values({ courseId, title: data.title, description: data.description, order: Number(count) })
      .returning()
    // Return with empty units array so the response shape matches getCourse output
    return { ...mod, units: [] }
  })
}

/**
 * Updates mutable fields on a module and bumps `updatedAt`.
 *
 * @param moduleId - UUID of the module to update.
 * @param data     - Partial fields to merge.
 */
export async function updateModule(moduleId: string, data: { title?: string; description?: string }) {
  const [mod] = await db.update(modules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(modules.id, moduleId))
    .returning()
  return mod ?? null
}

/**
 * Deletes a module. Units and blocks cascade via FK constraints.
 *
 * @param moduleId - UUID of the module to delete.
 */
export async function deleteModule(moduleId: string) {
  await db.delete(modules).where(eq(modules.id, moduleId))
}

/**
 * Reorders modules within a course by reassigning sequential `order` values.
 * All updates run inside a single transaction to avoid partial reorders.
 *
 * @param courseId - UUID of the parent course (not validated here; caller is trusted admin).
 * @param ids      - Ordered array of module UUIDs reflecting the desired position.
 */
export async function reorderModules(courseId: string, ids: string[]) {
  await db.transaction(async tx => {
    for (let i = 0; i < ids.length; i++) {
      // Scope the update to the parent course so IDs from a different course
      // cannot silently reorder unrelated modules (SECURITY: parent-scoped write).
      await tx.update(modules).set({ order: i, updatedAt: new Date() }).where(and(eq(modules.id, ids[i]), eq(modules.courseId, courseId)))
    }
  })
}
