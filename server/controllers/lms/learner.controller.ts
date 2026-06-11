import type { Request, Response, NextFunction } from 'express'
import * as learnerSvc from '../../services/lms/learner.service'
import * as progressSvc from '../../services/lms/progress.service'
import * as assessmentSvc from '../../services/lms/assessment.service'
import * as certSvc from '../../services/lms/certificate.service'
import * as actionPlanSvc from '../../services/lms/actionPlan.service'
import { AppError } from '../../utils/app-error'
import { db } from '../../db'
import { courseCertificates } from '../../db/schema'
import { eq, and } from 'drizzle-orm'

// ── Course endpoints ─────────────────────────────────────────────────────────

/**
 * GET /lms/courses
 * Returns all published courses enriched with enrollment and progress info
 * for the authenticated learner.
 */
export async function listLearnerCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await learnerSvc.getPublishedCourses(req.user!.userId)
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * GET /lms/courses/:courseId
 * Returns the full nested course structure with per-item progress and lock status
 * for an enrolled learner. Returns 403 if the learner is not enrolled.
 */
export async function getLearnerCourse(
  req: Request<{ courseId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await learnerSvc.getLearnerCourse(req.user!.userId, req.params.courseId)
    res.json({ success: true, data })
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_ENROLLED') {
      return next(new AppError('Not enrolled', 403, 'NOT_ENROLLED'))
    }
    next(e)
  }
}

/**
 * POST /lms/courses/:courseId/enroll
 * Enrolls the authenticated learner in the specified course.
 * Returns 201 with the new enrollment record on success.
 * Maps service errors to appropriate HTTP codes:
 *   COURSE_NOT_FOUND       → 404
 *   COURSE_NOT_PUBLISHED   → 400
 *   ALREADY_ENROLLED       → 409
 */
export async function enrollInCourse(
  req: Request<{ courseId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await learnerSvc.enrollUser(req.user!.userId, req.params.courseId)
    res.status(201).json({ success: true, data })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'COURSE_NOT_FOUND') return next(new AppError('Course not found', 404, 'COURSE_NOT_FOUND'))
      if (e.message === 'COURSE_NOT_PUBLISHED') return next(new AppError('Course is not published', 400, 'COURSE_NOT_PUBLISHED'))
      if (e.message === 'ALREADY_ENROLLED') return next(new AppError('Already enrolled in this course', 409, 'ALREADY_ENROLLED'))
    }
    next(e)
  }
}

// ── Progress endpoints ───────────────────────────────────────────────────────

/**
 * POST /lms/learning-blocks/:blockId/progress
 * Upserts block-level progress for the authenticated learner.
 * Propagates upward to unit/module/course on completion.
 */
export async function updateBlockProgress(
  req: Request<{ blockId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { status, videoWatchPct } = req.body as {
      status: 'not_started' | 'in_progress' | 'completed'
      videoWatchPct?: number
    }
    const data = await progressSvc.updateBlockProgress(req.user!.userId, req.params.blockId, status, videoWatchPct)
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/units/:unitId/progress
 * Upserts unit-level progress for the authenticated learner.
 * On completion, recalculates module and course progress and awards points.
 */
export async function updateUnitProgress(
  req: Request<{ unitId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { status } = req.body as { status: 'not_started' | 'in_progress' | 'completed' }
    const data = await progressSvc.updateUnitProgress(req.user!.userId, req.params.unitId, status)
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/questions/:questionId/answer
 * Saves (upserts) a learner's answer to a block question.
 * Returns 201 with the persisted answer record.
 */
export async function saveQuestionAnswer(
  req: Request<{ questionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { answerData } = req.body as {
      answerData: { selectedAnswer?: number; openEndedAnswer?: string }
    }
    const data = await progressSvc.saveQuestionAnswer(req.user!.userId, req.params.questionId, answerData)
    res.status(201).json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

// ── Action plan endpoints ────────────────────────────────────────────────────

/**
 * GET /lms/courses/:courseId/action-plan
 * Returns all action-plan questions for the course with the learner's saved answers.
 */
export async function getActionPlan(
  req: Request<{ courseId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await actionPlanSvc.getActionPlan(req.user!.userId, req.params.courseId)
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * GET /lms/courses/:courseId/action-plan/pdf
 * Generates and streams a PDF of the learner's action plan answers for the given course.
 * Returns 404 if the course is not found.
 */
export async function downloadActionPlanPdf(
  req: Request<{ courseId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const buffer = await actionPlanSvc.generateActionPlanPdf(req.user!.userId, req.params.courseId)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="action-plan-${req.params.courseId}.pdf"`)
    res.send(buffer)
  } catch (e) {
    if (e instanceof Error && e.message === 'COURSE_NOT_FOUND') {
      return next(new AppError('Course not found', 404, 'COURSE_NOT_FOUND'))
    }
    next(e)
  }
}

// ── Assessment endpoints ─────────────────────────────────────────────────────

/**
 * GET /lms/assessments/:assessmentId/summary
 * Returns attempt history, best score, pass state, and eligibility to start a new attempt.
 */
export async function getAssessmentSummary(
  req: Request<{ assessmentId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await assessmentSvc.getAssessmentSummary(req.user!.userId, req.params.assessmentId)
    res.json({ success: true, data })
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return next(new AppError('Assessment not found', 404, 'NOT_FOUND'))
    }
    next(e)
  }
}

/**
 * GET /lms/assessments/:assessmentId/questions
 * Returns assessment questions without correct answers (to avoid leakage during an attempt).
 */
export async function getAssessmentQuestions(
  req: Request<{ assessmentId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await assessmentSvc.getAssessmentQuestions(req.params.assessmentId)
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/assessments/:assessmentId/attempts
 * Grades and records a completed assessment attempt for the learner.
 * Returns 201 with the attempt result and updated summary.
 * Maps service errors:
 *   NOT_FOUND            → 404
 *   MAX_ATTEMPTS_EXCEEDED → 429
 */
export async function submitAssessmentAttempt(
  req: Request<{ assessmentId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { answers } = req.body as { answers: Record<string, number> }
    const data = await assessmentSvc.submitAttempt(req.user!.userId, req.params.assessmentId, answers)
    res.status(201).json({ success: true, data })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'NOT_FOUND') return next(new AppError('Assessment not found', 404, 'NOT_FOUND'))
      if (e.message === 'MAX_ATTEMPTS_EXCEEDED') return next(new AppError('Maximum attempts exceeded', 429, 'MAX_ATTEMPTS_EXCEEDED'))
    }
    next(e)
  }
}

// ── Certificate endpoints ────────────────────────────────────────────────────

/**
 * GET /lms/courses/:courseId/certificate
 * Returns the learner's certificate record for this course, or null if none exists.
 * Always returns 200 — data is null when no certificate has been issued yet.
 */
export async function getUserCourseCertificate(
  req: Request<{ courseId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId
    const [cert] = await db
      .select()
      .from(courseCertificates)
      .where(and(eq(courseCertificates.userId, userId), eq(courseCertificates.courseId, req.params.courseId)))
    res.json({ success: true, data: cert ?? null })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/courses/:courseId/certificate
 * Issues a certificate for the learner on the given course.
 * Returns 201 with the created certificate record.
 */
export async function issueCertificate(
  req: Request<{ courseId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await certSvc.issueCertificate(req.user!.userId, req.params.courseId)
    res.status(201).json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * GET /lms/certificates
 * Returns all certificates issued to the authenticated learner.
 */
export async function getUserCertificates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await certSvc.getUserCertificates(req.user!.userId)
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * GET /lms/certificates/:id/download
 * Streams the certificate PNG for the given certificate ID.
 * Returns 404 if the certificate record or file does not exist.
 */
export async function downloadCertificate(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const buffer = await certSvc.getCertificateFile(req.params.id)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${req.params.id}.png"`)
    res.send(buffer)
  } catch (e) {
    next(e)
  }
}
