import type { Request, Response, NextFunction } from "express";
import { validateSetupToken } from "../services/mentor.service";
import {
  addSlots,
  getSlots,
  deleteSlot,
  bulkDeleteSlots,
  getMentorAnalytics,
  getMentorSessions,
} from "../services/mentor_availability.service";
import { cancelSession, completeSession } from "../services/mentor_sessions.service";
import {
  saveSessionNotes,
  getMenteeNotes,
  saveMenteeNotes,
  saveMentorPhoto,
} from "../services/mentor_notes.service";
import { AppError } from "../utils/app-error";

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

// ---------------------------------------------------------------------------
// Notes (private to the mentor) and profile photo
// ---------------------------------------------------------------------------

/**
 * PATCH /api/mentor/sessions/:id/notes
 *
 * Saves the mentor's private notes on one of their own sessions.
 * Body: { notes: string }. Returns { data: { id, mentorNotes } }.
 */
export async function patchSessionNotes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await saveSessionNotes(req.user!.userId, req.params["id"] as string, req.body.notes as string);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/mentor/mentees/:menteeId/notes
 *
 * Returns { data: { menteeId, notes, updatedAt } } — the mentor's notes on an
 * SME who has booked them (empty notes and null updatedAt if none yet).
 */
export async function getMenteeNotesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getMenteeNotes(req.user!.userId, req.params["menteeId"] as string);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/mentor/mentees/:menteeId/notes
 *
 * Creates or replaces the mentor's notes on a mentee. Body: { notes: string }.
 */
export async function putMenteeNotesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await saveMenteeNotes(req.user!.userId, req.params["menteeId"] as string, req.body.notes as string);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/mentor/profile/photo
 *
 * Multipart upload (field `photo`, JPEG/PNG/WebP, max 5 MB). Stores the image
 * under /uploads/media, sets users.avatar_url and returns
 * { data: { avatarUrl } } — an absolute URL the client can load directly.
 */
export async function postProfilePhoto(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError('Send one image in the "photo" field', 400, "INVALID_UPLOAD");
    }
    const publicBase = process.env["SERVER_PUBLIC_URL"] ?? `${req.protocol}://${req.get("host")}`;
    const data = await saveMentorPhoto(req.user!.userId, req.file, publicBase);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}
