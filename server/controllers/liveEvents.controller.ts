import type { Request, Response, NextFunction } from 'express'
import * as svc from '../services/liveEvents.service'
import { hostStartUrl } from '../services/eventZoom.service'
import { zoomErrorSummary, zoomInfo } from '../services/zoom'
import { AppError } from '../utils/app-error'

/** Live events: public list, a learner's own view and bookings, and admin management. */

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The :id param, or a 404 for anything that isn't an event id. */
function eventId(req: Request): string {
  const id = String(req.params['id'] ?? '')
  if (!UUID.test(id)) throw new AppError('Event not found', 404, 'NOT_FOUND')
  return id
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): Handler =>
  async (req, res, next) => {
    try {
      const data = await fn(req, res)
      if (!res.headersSent) res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  }

/** GET /api/live-events — published events, without links (public). */
export const listPublished = wrap(() => svc.listPublishedEvents())
/** GET /api/live-events/mine — published events with the learner's own booking and, near the start, how to join. */
export const listMine = wrap((req) => svc.listForLearner(req.user!.userId))
export const rsvp = wrap((req) => svc.rsvp(req.user!.userId, eventId(req)))
export const cancelRsvp = wrap((req) => svc.cancelRsvp(req.user!.userId, eventId(req)))

export const listAll = wrap(() => svc.listAllEvents())
export const zoomStatus = wrap(async () => zoomInfo())
export const createEvent = wrap(async (req, res) => {
  res.status(201)
  return svc.createEvent(req.user!.userId, req.body as svc.EventInput)
})
export const updateEvent = wrap((req) => svc.updateEvent(eventId(req), req.body as Partial<svc.EventInput>))
export const deleteEvent = wrap(async (req) => {
  await svc.deleteEvent(eventId(req))
  return { ok: true }
})
export const bookings = wrap((req) => svc.listBookings(eventId(req)))
export const resyncZoom = wrap((req) => svc.resyncZoom(eventId(req)))

/** GET /api/live-events/:id/zoom/start-url — the host link, fetched fresh from Zoom (admins only, never stored). */
export const startUrl = wrap(async (req, res) => {
  const event = await svc.getEvent(eventId(req))
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND')
  res.setHeader('Cache-Control', 'no-store')
  try {
    return { url: await hostStartUrl(event) }
  } catch (err) {
    throw new AppError(zoomErrorSummary(err), 502, 'ZOOM_FAILED')
  }
})

export const exportBookings: Handler = async (req, res, next) => {
  try {
    const file = await svc.exportBookings(eventId(req), req.query['format'] === 'csv' ? 'csv' : 'xlsx')
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(file.body)
  } catch (err) {
    next(err)
  }
}
