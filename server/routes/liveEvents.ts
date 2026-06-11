import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { authenticate } from '../middleware/authenticate'
import { requireRole } from '../middleware/require-role'
import * as ctrl from '../controllers/liveEvents.controller'

const router = Router()

// null / "" → undefined so DB nulls don't fail re-save on optional fields
const optionalUrl = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().url().max(1000).optional(),
)

const optionalStr = (max: number) =>
  z.preprocess(
    (v) => (v === null ? undefined : v),
    z.string().max(max).trim().optional(),
  )

const createDto = z.object({
  title:         z.string().min(1).max(300).trim(),
  description:   optionalStr(3000),
  type:          z.string().min(1).max(100).trim().default('Webinar'),
  track:         optionalStr(100),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  time:          z.string().min(1).max(100).trim(),
  meetingLink:   optionalUrl,
  recordingLink: optionalUrl,
  coverImage:    optionalStr(1000),
  status:        z.enum(['draft', 'published']).default('draft'),
})

/** DTO for updating a live event — all fields optional. */
const updateDto = createDto.partial()

// ── Public routes ──────────────────────────────────────────────────────────────

/** GET /api/live-events — published events only; consumed by the SME dashboard */
router.get('/', ctrl.listPublished)

// ── Admin-only routes ──────────────────────────────────────────────────────────

/** GET /api/live-events/admin — all events (draft + published) */
router.get('/admin', authenticate, requireRole('admin'), ctrl.listAll)

/** POST /api/live-events — create a new event */
router.post('/', validate(createDto), authenticate, requireRole('admin'), ctrl.createEvent)

/** PATCH /api/live-events/:id — partial update */
router.patch('/:id', validate(updateDto), authenticate, requireRole('admin'), ctrl.updateEvent)

/** DELETE /api/live-events/:id — permanent delete */
router.delete('/:id', authenticate, requireRole('admin'), ctrl.deleteEvent)

export default router
