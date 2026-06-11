import type { Request, Response, NextFunction } from 'express'
import * as svc from '../../services/lms/courses.service'
import { AppError } from '../../utils/app-error'

/**
 * GET /lms/admin/courses
 * Returns all courses ordered by most recently updated.
 */
export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await svc.listCourses() })
  } catch (e) {
    next(e)
  }
}

/**
 * GET /lms/admin/courses/:id
 * Returns a single course with its full nested structure, or 404 if not found.
 */
export async function get(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const c = await svc.getCourse(req.params.id)
    if (!c) {
      throw new AppError('Not found', 404, 'NOT_FOUND')
    }
    res.json({ success: true, data: c })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/admin/courses
 * Creates a new course. Body is pre-validated and defaulted by Zod via
 * the `validate(createCourseDto)` middleware in the routes file.
 * Responds with 201 and the created course.
 */
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // req.body has been parsed and sanitised by Zod — destructure only the
    // explicit allowlist so no extra fields (e.g. createdAt) can leak through.
    const { title, description, cover, difficulty, pointsPerUnit, enableCertificate, status } = req.body as {
      title: string
      description?: string | null
      cover?: string | null
      difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
      pointsPerUnit: number
      enableCertificate: boolean
      status: 'draft' | 'published'
    }
    res.status(201).json({
      success: true,
      data: await svc.createCourse({ title, description, cover, difficulty, pointsPerUnit, enableCertificate, status }),
    })
  } catch (e) {
    next(e)
  }
}

/**
 * PATCH /lms/admin/courses/:id
 * Partially updates a course. Body is pre-validated by Zod (all fields optional).
 * Returns 404 if the course does not exist.
 */
export async function update(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    // Destructure only the explicit allowlist — Zod has already stripped unknown
    // fields, but being explicit here documents intent and keeps types precise.
    const { title, description, cover, difficulty, pointsPerUnit, enableCertificate, status } = req.body as {
      title?: string
      description?: string | null
      cover?: string | null
      difficulty?: 'Beginner' | 'Intermediate' | 'Advanced'
      pointsPerUnit?: number
      enableCertificate?: boolean
      status?: 'draft' | 'published'
    }
    const c = await svc.updateCourse(req.params.id, {
      title,
      description,
      cover,
      difficulty,
      pointsPerUnit,
      enableCertificate,
      status,
    })
    if (!c) {
      throw new AppError('Not found', 404, 'NOT_FOUND')
    }
    res.json({ success: true, data: c })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /lms/admin/courses/:id
 * Deletes a course and all its children. Always returns { ok: true }.
 */
export async function remove(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteCourse(req.params.id)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}
