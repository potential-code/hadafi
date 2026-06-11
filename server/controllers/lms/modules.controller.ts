import type { Request, Response, NextFunction } from 'express'
import * as svc from '../../services/lms/modules.service'
import { AppError } from '../../utils/app-error'

/**
 * POST /lms/admin/courses/:courseId/modules
 * Creates a new module at the end of the given course.
 * Body is pre-validated by Zod (title required, description optional).
 */
export async function create(req: Request<{ courseId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, description } = req.body as { title: string; description?: string | null }
    res.status(201).json({ success: true, data: await svc.createModule(req.params.courseId, { title, description: description ?? undefined }) })
  } catch (e) {
    next(e)
  }
}

/**
 * PATCH /lms/admin/modules/:moduleId
 * Partially updates a module. Body pre-validated by Zod (all fields optional).
 * Returns 404 if the module does not exist.
 */
export async function update(req: Request<{ moduleId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, description } = req.body as { title?: string; description?: string | null }
    const m = await svc.updateModule(req.params.moduleId, { title, description: description ?? undefined })
    if (!m) {
      throw new AppError('Not found', 404, 'NOT_FOUND')
    }
    res.json({ success: true, data: m })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /lms/admin/modules/:moduleId
 * Deletes a module and its children.
 */
export async function remove(req: Request<{ moduleId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteModule(req.params.moduleId)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/admin/courses/:courseId/modules/reorder
 * Reorders modules within a course. Body pre-validated by Zod as { ids: string[] }.
 * Rejects an empty ids array — every position must be accounted for.
 */
export async function reorder(req: Request<{ courseId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids } = req.body as { ids: string[] }
    if (ids.length === 0) {
      throw new AppError('ids must not be empty', 400, 'VALIDATION_ERROR')
    }
    await svc.reorderModules(req.params.courseId, ids)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}
