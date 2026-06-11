import type { Request, Response, NextFunction } from 'express'
import * as svc from '../../services/lms/assessments.service'
import { AppError } from '../../utils/app-error'

/**
 * POST /lms/admin/courses/:courseId/assessments
 * Creates a new assessment (pre or post) for the given course.
 * Body pre-validated by Zod (title and assessmentType required; others defaulted).
 */
export async function create(req: Request<{ courseId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, description, assessmentType, isGraded, passingScore, showAnswers, maxAttempts } = req.body as {
      title: string
      description?: string | null
      assessmentType: 'pre' | 'post'
      isGraded: boolean
      passingScore: number
      showAnswers: boolean
      maxAttempts: number
    }
    res.status(201).json({
      success: true,
      data: await svc.createAssessment(req.params.courseId, { title, description, assessmentType, isGraded, passingScore, showAnswers, maxAttempts }),
    })
  } catch (e) {
    next(e)
  }
}

/**
 * PATCH /lms/admin/assessments/:assessmentId
 * Partially updates an assessment. Body pre-validated by Zod (all fields optional;
 * `assessmentType` excluded from update allowlist — assessment type is immutable).
 * Returns 404 if not found.
 */
export async function update(req: Request<{ assessmentId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, description, isGraded, passingScore, showAnswers, maxAttempts } = req.body as {
      title?: string
      description?: string | null
      isGraded?: boolean
      passingScore?: number
      showAnswers?: boolean
      maxAttempts?: number
    }
    const a = await svc.updateAssessment(req.params.assessmentId, { title, description, isGraded, passingScore, showAnswers, maxAttempts })
    if (!a) {
      throw new AppError('Not found', 404, 'NOT_FOUND')
    }
    res.json({ success: true, data: a })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /lms/admin/assessments/:assessmentId
 * Deletes an assessment and its questions.
 */
export async function remove(req: Request<{ assessmentId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteAssessment(req.params.assessmentId)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/admin/assessments/:assessmentId/questions
 * Creates a new question on the given assessment.
 * Body pre-validated by Zod (questionText required; questionType and others defaulted).
 */
export async function createQuestion(req: Request<{ assessmentId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { questionType, questionText, options, correctAnswer, explanation } = req.body as {
      questionType: 'multiple-choice' | 'true-false'
      questionText: string
      options: string[]
      correctAnswer: number
      explanation?: string | null
    }
    res.status(201).json({
      success: true,
      data: await svc.createAssessmentQuestion(req.params.assessmentId, { questionType, questionText, options, correctAnswer, explanation }),
    })
  } catch (e) {
    next(e)
  }
}

/**
 * PATCH /lms/admin/assessment-questions/:questionId
 * Partially updates an assessment question. Body pre-validated by Zod (all fields optional).
 * Returns 404 if not found.
 */
export async function updateQuestion(req: Request<{ questionId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { questionType, questionText, options, correctAnswer, explanation } = req.body as {
      questionType?: 'multiple-choice' | 'true-false'
      questionText?: string
      options?: string[]
      correctAnswer?: number
      explanation?: string | null
    }
    const q = await svc.updateAssessmentQuestion(req.params.questionId, { questionType, questionText, options, correctAnswer, explanation })
    if (!q) {
      throw new AppError('Not found', 404, 'NOT_FOUND')
    }
    res.json({ success: true, data: q })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /lms/admin/assessment-questions/:questionId
 * Deletes an assessment question.
 */
export async function removeQuestion(req: Request<{ questionId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteAssessmentQuestion(req.params.questionId)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/admin/assessments/:assessmentId/questions/reorder
 * Reorders questions within an assessment. Body pre-validated by Zod as { ids: string[] }.
 * Rejects an empty ids array — every position must be accounted for.
 */
export async function reorderQuestions(req: Request<{ assessmentId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids } = req.body as { ids: string[] }
    if (ids.length === 0) {
      throw new AppError('ids must not be empty', 400, 'VALIDATION_ERROR')
    }
    await svc.reorderAssessmentQuestions(req.params.assessmentId, ids)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}
