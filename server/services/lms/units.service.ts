import { db } from '../../db'
import { units } from '../../db/schema'
import { and, eq, sql } from 'drizzle-orm'

/**
 * Creates a new unit at the end of a module's unit list.
 * The count read and insert are wrapped in a transaction to prevent a race
 * condition where two concurrent creates could receive the same order value.
 *
 * @param moduleId - UUID of the parent module.
 * @param data     - Unit title, optional description, and optional duration.
 */
export async function createUnit(moduleId: string, data: { title: string; description?: string; durationMinutes?: number }) {
  return db.transaction(async tx => {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(units).where(eq(units.moduleId, moduleId))
    const [unit] = await tx.insert(units)
      .values({ moduleId, title: data.title, description: data.description, durationMinutes: data.durationMinutes, order: Number(count) })
      .returning()
    // Return with empty blocks array so the response shape matches getCourse output
    return { ...unit, blocks: [] }
  })
}

/**
 * Updates mutable fields on a unit and bumps `updatedAt`.
 *
 * @param unitId - UUID of the unit to update.
 * @param data   - Partial fields to merge.
 */
export async function updateUnit(unitId: string, data: { title?: string; description?: string; durationMinutes?: number }) {
  const [unit] = await db.update(units)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(units.id, unitId))
    .returning()
  return unit ?? null
}

/**
 * Deletes a unit. Learning blocks and questions cascade via FK constraints.
 *
 * @param unitId - UUID of the unit to delete.
 */
export async function deleteUnit(unitId: string) {
  await db.delete(units).where(eq(units.id, unitId))
}

/**
 * Reorders units within a module by reassigning sequential `order` values.
 * All updates run inside a single transaction to avoid partial reorders.
 *
 * @param moduleId - UUID of the parent module (not validated here; caller is trusted admin).
 * @param ids      - Ordered array of unit UUIDs reflecting the desired position.
 */
export async function reorderUnits(moduleId: string, ids: string[]) {
  await db.transaction(async tx => {
    for (let i = 0; i < ids.length; i++) {
      // Scope the update to the parent module so IDs from a different module
      // cannot silently reorder unrelated units (SECURITY: parent-scoped write).
      await tx.update(units).set({ order: i, updatedAt: new Date() }).where(and(eq(units.id, ids[i]), eq(units.moduleId, moduleId)))
    }
  })
}
