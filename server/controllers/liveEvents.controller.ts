import type { Request, Response, NextFunction } from 'express'
import * as liveEventsService from '../services/liveEvents.service'

/**
 * GET /live-events
 * Returns all published events. Public — no authentication required.
 */
export async function listPublished(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const events = await liveEventsService.listPublishedEvents()
    res.json({ success: true, data: events })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /live-events/admin
 * Returns all events regardless of status. Admin only.
 */
export async function listAll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const events = await liveEventsService.listAllEvents()
    res.json({ success: true, data: events })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /live-events
 * Creates a new live event. Admin only.
 * req.user is guaranteed by the authenticate middleware upstream.
 */
export async function createEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.user is set by authenticate; the ! is safe here — route requires auth
    const event = await liveEventsService.createEvent(req.user!.userId, req.body)
    res.status(201).json({ success: true, data: event })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /live-events/:id
 * Partially updates a live event. Admin only.
 */
export async function updateEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const event = await liveEventsService.updateEvent(req.params["id"] as string, req.body)
    res.json({ success: true, data: event })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /live-events/:id
 * Permanently removes a live event. Admin only.
 */
export async function deleteEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await liveEventsService.deleteEvent(req.params["id"] as string)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}
