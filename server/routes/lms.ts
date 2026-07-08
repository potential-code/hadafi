import { Router, type IRouter } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate'
import { requireRole } from '../middleware/require-role'
import { validate } from '../middleware/validate'
import * as courses from '../controllers/lms/courses.controller'
import * as modulesCtrl from '../controllers/lms/modules.controller'
import * as unitsCtrl from '../controllers/lms/units.controller'
import * as blocksCtrl from '../controllers/lms/blocks.controller'
import * as assessmentsCtrl from '../controllers/lms/assessments.controller'
import * as learner from '../controllers/lms/learner.controller'

const router: IRouter = Router()

// ---------------------------------------------------------------------------
// Request DTOs — Admin
// ---------------------------------------------------------------------------

// --- Course DTOs ---

/**
 * Full set of fields for creating a course. All fields with defaults are optional
 * at the HTTP layer — Zod fills in the default before the controller sees the body.
 */
const createCourseDto = z.object({
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(5000).optional().nullable(),
  cover: z
    .string()
    .refine(
      (val) => val.startsWith('/') || z.string().url().safeParse(val).success,
      { message: "cover must be a valid URL or a path starting with '/'" },
    )
    .optional()
    .nullable(),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']).default('Beginner'),
  pointsPerUnit: z.number().int().min(0).default(10),
  enableCertificate: z.boolean().default(true),
  status: z.enum(['draft', 'published']).default('draft'),
})

/** Partial update — every field optional; same allowlist as create (no timestamps). */
const updateCourseDto = createCourseDto.partial()

// --- Module DTOs ---

/** Requires title; description is optional. */
const createModuleDto = z.object({
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(5000).optional().nullable(),
})

const updateModuleDto = createModuleDto.partial()

/**
 * Used by all reorder endpoints. Validated as a non-empty UUID array at the
 * controller level (empty array guard) to ensure order assignment is well-defined.
 */
const reorderDto = z.object({ ids: z.array(z.string().uuid()) })

// --- Unit DTOs ---

const createUnitDto = z.object({
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(5000).optional().nullable(),
  durationMinutes: z.number().int().min(0).optional().nullable(),
})

const updateUnitDto = createUnitDto.partial()

// --- Block DTOs ---

const createBlockDto = z.object({
  title: z.string().max(500).trim().default(''),
  type: z.enum(['text', 'video', 'image', 'question']),
  body: z.string().optional().nullable(),
  videoUrl: z.string().url().optional().nullable(),
  transcript: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
})

/**
 * `type` is immutable after creation — omit it from the update allowlist so
 * changing the block type via PATCH is rejected at the schema level.
 */
const updateBlockDto = createBlockDto.partial().omit({ type: true })

// --- Block Question DTOs ---

const createBlockQuestionDto = z.object({
  kind: z.enum(['survey', 'action-plan']).default('survey'),
  format: z.enum(['multiple-choice', 'true-false', 'short-text']).default('multiple-choice'),
  prompt: z.string().min(1).max(2000).trim(),
  options: z.array(z.string()).optional().nullable(),
  correctIndex: z.number().int().min(0).optional().nullable(),
  correctBool: z.boolean().optional().nullable(),
  placeholder: z.string().optional().nullable(),
})

const updateBlockQuestionDto = createBlockQuestionDto.partial()

// --- Assessment DTOs ---

const createAssessmentDto = z.object({
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(5000).optional().nullable(),
  assessmentType: z.enum(['pre', 'post']),
  isGraded: z.boolean().default(true),
  passingScore: z.number().int().min(0).max(100).default(70),
  showAnswers: z.boolean().default(false),
  maxAttempts: z.number().int().min(0).default(0),
})

/**
 * `assessmentType` ('pre'/'post') is immutable after creation — omit it from
 * the update allowlist to prevent silently swapping assessment purpose.
 */
const updateAssessmentDto = createAssessmentDto.partial().omit({ assessmentType: true })

// --- Assessment Question DTOs ---

const createAssessmentQuestionDto = z.object({
  questionType: z.enum(['multiple-choice', 'true-false']).default('multiple-choice'),
  questionText: z.string().min(1).max(2000).trim(),
  options: z.array(z.string()).default([]),
  correctAnswer: z.number().int().min(0).default(0),
  explanation: z.string().optional().nullable(),
})

const updateAssessmentQuestionDto = createAssessmentQuestionDto.partial()

// ---------------------------------------------------------------------------
// Request DTOs — Learner
// ---------------------------------------------------------------------------

const blockProgressDto = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed']),
  videoWatchPct: z.number().int().min(0).max(100).optional(),
})

const unitProgressDto = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed']),
})

const questionAnswerDto = z.object({
  answerData: z.object({
    selectedAnswer: z.number().int().optional(),
    openEndedAnswer: z.string().optional(),
  }),
})

const assessmentAttemptDto = z.object({
  answers: z.record(z.string().uuid(), z.number().int().min(0)),
})

// ---------------------------------------------------------------------------
// Admin sub-router — requires JWT + admin role
// ---------------------------------------------------------------------------

const adminRouter: IRouter = Router()
adminRouter.use(authenticate, requireRole('admin'))

// Courses
adminRouter.get('/courses', courses.list)
adminRouter.post('/courses', validate(createCourseDto), courses.create)
adminRouter.get('/courses/:id', courses.get)
adminRouter.patch('/courses/:id', validate(updateCourseDto), courses.update)
adminRouter.delete('/courses/:id', courses.remove)

// Modules  (parent: course)
// reorder must come before /:moduleId routes to prevent 'reorder' being
// treated as a moduleId param
adminRouter.post('/courses/:courseId/modules', validate(createModuleDto), modulesCtrl.create)
adminRouter.post('/courses/:courseId/modules/reorder', validate(reorderDto), modulesCtrl.reorder)
adminRouter.patch('/modules/:moduleId', validate(updateModuleDto), modulesCtrl.update)
adminRouter.delete('/modules/:moduleId', modulesCtrl.remove)

// Units  (parent: module)
adminRouter.post('/modules/:moduleId/units', validate(createUnitDto), unitsCtrl.create)
adminRouter.post('/modules/:moduleId/units/reorder', validate(reorderDto), unitsCtrl.reorder)
adminRouter.patch('/units/:unitId', validate(updateUnitDto), unitsCtrl.update)
adminRouter.delete('/units/:unitId', unitsCtrl.remove)

// Learning Blocks  (parent: unit)
adminRouter.post('/units/:unitId/blocks', validate(createBlockDto), blocksCtrl.create)
adminRouter.post('/units/:unitId/blocks/reorder', validate(reorderDto), blocksCtrl.reorder)
adminRouter.patch('/blocks/:blockId', validate(updateBlockDto), blocksCtrl.update)
adminRouter.delete('/blocks/:blockId', blocksCtrl.remove)

// Block Questions  (parent: block)
adminRouter.post('/blocks/:blockId/questions', validate(createBlockQuestionDto), blocksCtrl.createQuestion)
adminRouter.post('/blocks/:blockId/questions/reorder', validate(reorderDto), blocksCtrl.reorderQuestions)
adminRouter.patch('/block-questions/:questionId', validate(updateBlockQuestionDto), blocksCtrl.updateQuestion)
adminRouter.delete('/block-questions/:questionId', blocksCtrl.removeQuestion)

// Assessments  (parent: course)
adminRouter.post('/courses/:courseId/assessments', validate(createAssessmentDto), assessmentsCtrl.create)
adminRouter.patch('/assessments/:assessmentId', validate(updateAssessmentDto), assessmentsCtrl.update)
adminRouter.delete('/assessments/:assessmentId', assessmentsCtrl.remove)

// Assessment Questions  (parent: assessment)
adminRouter.post('/assessments/:assessmentId/questions', validate(createAssessmentQuestionDto), assessmentsCtrl.createQuestion)
adminRouter.post('/assessments/:assessmentId/questions/reorder', validate(reorderDto), assessmentsCtrl.reorderQuestions)
adminRouter.patch('/assessment-questions/:questionId', validate(updateAssessmentQuestionDto), assessmentsCtrl.updateQuestion)
adminRouter.delete('/assessment-questions/:questionId', assessmentsCtrl.removeQuestion)

// ---------------------------------------------------------------------------
// Learner sub-router — requires JWT only (any authenticated role)
// ---------------------------------------------------------------------------

const learnerRouter: IRouter = Router()
learnerRouter.use(authenticate)

// Courses
learnerRouter.get('/courses', learner.listLearnerCourses)
learnerRouter.get('/courses/:courseId', learner.getLearnerCourse)
learnerRouter.post('/courses/:courseId/enroll', learner.enrollInCourse)

// Progress
learnerRouter.post('/learning-blocks/:blockId/progress', validate(blockProgressDto), learner.updateBlockProgress)
learnerRouter.post('/units/:unitId/progress', validate(unitProgressDto), learner.updateUnitProgress)
learnerRouter.post('/questions/:questionId/answer', validate(questionAnswerDto), learner.saveQuestionAnswer)

// Action plan
// NOTE: /pdf must be registered before /:courseId to prevent 'pdf' being captured as a param
learnerRouter.get('/courses/:courseId/action-plan/pdf', learner.downloadActionPlanPdf)
learnerRouter.get('/courses/:courseId/action-plan', learner.getActionPlan)

// Assessments
learnerRouter.get('/assessments/:assessmentId/summary', learner.getAssessmentSummary)
learnerRouter.get('/assessments/:assessmentId/questions', learner.getAssessmentQuestions)
learnerRouter.post('/assessments/:assessmentId/attempts', validate(assessmentAttemptDto), learner.submitAssessmentAttempt)

// Certificates
// /certificates must come before /courses/:courseId/certificate to avoid param conflicts
learnerRouter.get('/certificates', learner.getUserCertificates)
learnerRouter.get('/certificates/:id/download', learner.downloadCertificate)
learnerRouter.get('/courses/:courseId/certificate', learner.getUserCourseCertificate)
learnerRouter.post('/courses/:courseId/certificate', learner.issueCertificate)

// ---------------------------------------------------------------------------
// Mount sub-routers
// ---------------------------------------------------------------------------

// Admin routes are scoped under /admin; learner routes live at the root
router.use('/admin', adminRouter)
router.use('/', learnerRouter)

export default router
