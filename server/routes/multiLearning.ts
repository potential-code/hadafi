import { Router, type IRouter, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate'
import { validate } from '../middleware/validate'
import { perUser, HOUR } from '../middleware/limits'
import * as tutor from '../services/multiLearning.service'
import { getCourseAssistantContext } from '../services/courseAssistant.service'

/**
 * Multi Learning (Hana as the tutor), mounted at /api/multi-learning, and the
 * course-page assistant's context, at /api/course-assistant. Any signed-in
 * learner, like the course page's own learner routes; every handler checks
 * enrolment itself (multiLearning.service, courseAssistant.service).
 */

type Handler = (req: Request, res: Response) => Promise<unknown>
const send =
  (fn: Handler) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await fn(req, res)
      res.json({ success: true, data })
    } catch (e) {
      next(e)
    }
  }

const uid = (req: Request) => req.user!.userId
const param = (req: Request, name: string) => String(req.params[name] ?? '')
/** ?lang=: English, Arabic or Urdu; anything else is English (as SMEEP). */
const lang = (req: Request): tutor.LearnerLanguage => (tutor.isLearnerLanguage(req.query['lang']) ? req.query['lang'] : 'en')

// Same bound as the course page's progress endpoints.
const progressLimit = perUser('multi-learning-progress', HOUR, 300)

const completeDto = z.object({ learningBlockIds: z.array(z.string().uuid()).min(1).max(50) }).strict()
const stepDto = z
  .object({
    answers: z
      .array(
        z
          .object({
            questionId: z.string().uuid(),
            text: z.string().max(tutor.MAX_ANSWER_CHARS).optional(),
            selected: z.number().int().min(0).max(50).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
const quizDto = z
  .object({
    answers: z
      .array(z.object({ questionId: z.string().uuid(), selectedIndex: z.number().int().min(-1).max(50) }).strict())
      .max(200),
  })
  .strict()

export const multiLearningRouter: IRouter = Router()
multiLearningRouter.use(authenticate)

multiLearningRouter.get(
  '/state',
  send((req) => {
    const courseId = typeof req.query['courseId'] === 'string' ? req.query['courseId'] : null
    const introSeen =
      typeof req.query['introSeen'] === 'string'
        ? req.query['introSeen'].split(',').filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 200)
        : []
    return tutor.getCourseState(uid(req), { courseId, introSeen, lang: lang(req) })
  }),
)
multiLearningRouter.get('/units/:unitId/intro', send((req) => tutor.getUnitIntro(uid(req), param(req, 'unitId'), lang(req))))
multiLearningRouter.get('/units/:unitId/material', send((req) => tutor.getUnitMaterial(uid(req), param(req, 'unitId'))))
multiLearningRouter.get('/videos/:blockId', send((req) => tutor.getVideo(uid(req), param(req, 'blockId'), lang(req))))
multiLearningRouter.get('/steps/:blockId', send((req) => tutor.getQuestionStep(uid(req), param(req, 'blockId'), lang(req))))
multiLearningRouter.post(
  '/steps/:blockId/submit',
  progressLimit,
  validate(stepDto),
  send((req) => tutor.submitQuestionStep(uid(req), param(req, 'blockId'), req.body.answers)),
)
multiLearningRouter.get('/quizzes/:assessmentId', send((req) => tutor.getQuiz(uid(req), param(req, 'assessmentId'), lang(req))))
multiLearningRouter.post(
  '/quizzes/:assessmentId/submit',
  progressLimit,
  validate(quizDto),
  send((req) => tutor.submitQuiz(uid(req), param(req, 'assessmentId'), req.body.answers)),
)
multiLearningRouter.post(
  '/progress/complete',
  progressLimit,
  validate(completeDto),
  send(async (req) => {
    await tutor.completeBlocks(uid(req), req.body.learningBlockIds)
    return { ok: true }
  }),
)

export const courseAssistantRouter: IRouter = Router()
courseAssistantRouter.use(authenticate)

courseAssistantRouter.get(
  '/courses/:courseId/context',
  send((req) =>
    getCourseAssistantContext(uid(req), param(req, 'courseId'), typeof req.query['step'] === 'string' ? req.query['step'] : null),
  ),
)
