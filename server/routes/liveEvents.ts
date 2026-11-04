import { Router } from 'express'
import { z } from 'zod'
import { patchOf } from '../utils/zodPatch'
import { validate } from '../middleware/validate'
import { authenticate } from '../middleware/authenticate'
import { requireRole } from '../middleware/require-role'
import { perUser, HOUR } from '../middleware/limits'
import * as ctrl from '../controllers/liveEvents.controller'

const router = Router()

/** An http(s) link only: these land in learners' href attributes. */
const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), 'Use a link starting with https://')

// null / "" → undefined so DB nulls don't fail re-save on optional fields
const optionalUrl = z.preprocess((v) => (v === '' || v === null ? undefined : v), httpUrl.optional())
const optionalStr = (max: number) => z.preprocess((v) => (v === null ? undefined : v), z.string().max(max).trim().optional())

const createDto = z
  .object({
    title: z.string().min(1).max(300).trim(),
    description: optionalStr(3000),
    type: z.string().min(1).max(100).trim().default('Webinar'),
    /** The day and wall-clock start in `timezone` (what the admin form sends). */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
    timezone: z.string().min(1).max(64).optional(),
    /** Or an ISO date-time with its offset (SMEEP's API). */
    startsAt: z.string().datetime({ offset: true }).optional(),
    /** Or the old date and free-text time, read as UAE time. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
    time: z.string().min(1).max(100).trim().optional(),
    durationMinutes: z.number().int().min(15).max(600).default(60),
    /** Places available; null or absent means no limit. */
    capacity: z.preprocess((v) => (v === '' ? null : v), z.number().int().min(1).max(100_000).nullable().optional()),
    format: z.enum(['zoom', 'link', 'in_person']).default('link'),
    meetingLink: optionalUrl,
    location: optionalStr(300),
    recordingLink: optionalUrl,
    coverImage: optionalStr(1000),
    status: z.enum(['draft', 'published']).default('draft'),
  })
  .strict()

const updateDto = patchOf(createDto).strict().refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' })

// ── Public and learner ───────────────────────────────────────────────────────

/** Published events without links or bookings (the homepage, signed out). */
router.get('/', ctrl.listPublished)
/** Published events with the learner's own booking and, near the start, how to join. */
router.get('/mine', authenticate, ctrl.listMine)
// Booking registers the learner on Zoom and can send an email: one shared budget for book and cancel.
const rsvpLimit = perUser('event-rsvp', HOUR, 30, 'You have booked and cancelled a lot just now. Please try again later.')
router.post('/:id/rsvp', authenticate, requireRole('sme'), rsvpLimit, ctrl.rsvp)
router.delete('/:id/rsvp', authenticate, requireRole('sme'), rsvpLimit, ctrl.cancelRsvp)

// ── Admin ────────────────────────────────────────────────────────────────────

router.get('/admin', authenticate, requireRole('admin'), ctrl.listAll)
router.get('/admin/zoom', authenticate, requireRole('admin'), ctrl.zoomStatus)
router.post('/', authenticate, requireRole('admin'), validate(createDto), ctrl.createEvent)
router.patch('/:id', authenticate, requireRole('admin'), validate(updateDto), ctrl.updateEvent)
router.delete('/:id', authenticate, requireRole('admin'), ctrl.deleteEvent)
router.get('/:id/bookings', authenticate, requireRole('admin'), ctrl.bookings)
router.get('/:id/bookings/export', authenticate, requireRole('admin'), ctrl.exportBookings)
router.post('/:id/zoom/resync', authenticate, requireRole('admin'), ctrl.resyncZoom)
router.get('/:id/zoom/start-url', authenticate, requireRole('admin'), ctrl.startUrl)

export default router
