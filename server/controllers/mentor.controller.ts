import type { Request, Response, NextFunction } from "express";
import { validateSetupToken, completeMentorSetup } from "../services/mentor.service";
import {
  addSlots,
  getSlots,
  deleteSlot,
  bulkDeleteSlots,
  getMentorAnalytics,
  getMentorSessions,
} from "../services/mentor_availability.service";
import { cancelSession, completeSession } from "../services/mentor_sessions.service";

export async function getSetupToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.query["token"] as string;
    const info = await validateSetupToken(token);
    res.json(info);
  } catch (err) {
    next(err);
  }
}

export async function postSetup(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await completeMentorSetup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * GET /api/mentor/analytics
 *
 * Returns upcomingSessions, totalMentees, and completedSessions counts for the
 * authenticated mentor's overview dashboard card.
 */
export async function getAnalytics(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getMentorAnalytics(req.user!.userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Availability slots
// ---------------------------------------------------------------------------

/**
 * POST /api/mentor/availability
 *
 * Accepts an array of ISO datetime strings and creates 1-hour availability
 * slots for the authenticated mentor.
 */
export async function postAvailability(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.body.slots is validated by Zod as an array of { startsAt: string }.
    // Convert ISO strings to Date objects before passing to the service.
    const slots = (req.body.slots as { startsAt: string }[]).map((s) => ({
      startsAt: new Date(s.startsAt),
    }));
    const { inserted, skippedDuplicates } = await addSlots(req.user!.userId, slots);
    res.status(201).json({ slots: inserted, skippedDuplicates });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/mentor/availability
 *
 * Returns the authenticated mentor's availability slots split into upcoming
 * and past buckets.
 */
export async function getAvailability(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getSlots(req.user!.userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/mentor/availability/:id
 *
 * Deletes a single unbooked slot owned by the authenticated mentor.
 */
export async function deleteAvailabilitySlot(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await deleteSlot(req.user!.userId, req.params["id"] as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/mentor/availability/bulk-delete
 *
 * Deletes multiple unbooked slots by ID. Booked or unowned slots are skipped.
 * Returns { deleted, skipped } counts.
 */
export async function bulkDeleteAvailability(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await bulkDeleteSlots(req.user!.userId, req.body.ids as string[]);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Sessions list
// ---------------------------------------------------------------------------

/**
 * GET /api/mentor/sessions
 *
 * Returns the authenticated mentor's sessions (enriched with slot timing and
 * SME details) split into upcoming and past buckets.
 */
export async function getMentorSessionsList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getMentorSessions(req.user!.userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Session state transitions — Phase 3 stubs
// ---------------------------------------------------------------------------

/**
 * PATCH /api/mentor/sessions/:id/cancel
 *
 * Cancels a confirmed session on behalf of the authenticated mentor.
 * Restores the underlying slot's availability so it can be rebooked.
 */
export async function cancelMentorSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await cancelSession(req.user!.userId, req.params["id"] as string, "mentor");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/mentor/sessions/:id/complete
 *
 * Marks a confirmed session as completed. Only the mentor who owns the session
 * may perform this action.
 */
export async function completeMentorSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await completeSession(req.user!.userId, req.params["id"] as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
