import type { Request, Response, NextFunction } from 'express'
import * as svc from '../../services/lms/units.service'
import { AppError } from '../../utils/app-error'

/**
 * POST /lms/admin/modules/:moduleId/units
 * Creates a new unit at the end of the given module.
 * Body pre-validated by Zod (title required, description and durationMinutes optional).
 */
export async function create(req: Request<{ moduleId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, description, durationMinutes } = req.body as {
      title: string
      description?: string | null
      durationMinutes?: number | null
    }
    // Service expects `string | undefined`, not `string | null` — convert null to undefined
    res.status(201).json({ success: true, data: await svc.createUnit(req.params.moduleId, { title, description: description ?? undefined, durationMinutes: durationMinutes ?? undefined }) })
  } catch (e) {
    next(e)
  }
}

/**
 * PATCH /lms/admin/units/:unitId
 * Partially updates a unit. Body pre-validated by Zod (all fields optional).
 * Returns 404 if the unit does not exist.
 */
export async function update(req: Request<{ unitId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, description, durationMinutes } = req.body as {
      title?: string
      description?: string | null
      durationMinutes?: number | null
    }
    // Service expects `string | undefined`, not `string | null` — convert null to undefined
    const u = await svc.updateUnit(req.params.unitId, { title, description: description ?? undefined, durationMinutes: durationMinutes ?? undefined })
    if (!u) {
      throw new AppError('Not found', 404, 'NOT_FOUND')
    }
    res.json({ success: true, data: u })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /lms/admin/units/:unitId
 * Deletes a unit and its children.
 */
export async function remove(req: Request<{ unitId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteUnit(req.params.unitId)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/admin/modules/:moduleId/units/reorder
 * Reorders units within a module. Body pre-validated by Zod as { ids: string[] }.
 * Rejects an empty ids array — every position must be accounted for.
 */
export async function reorder(req: Request<{ moduleId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids } = req.body as { ids: string[] }
    if (ids.length === 0) {
      throw new AppError('ids must not be empty', 400, 'VALIDATION_ERROR')
    }
    await svc.reorderUnits(req.params.moduleId, ids)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}
