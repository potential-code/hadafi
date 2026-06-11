import type { Request, Response, NextFunction } from "express";

import { getMentorsList, getMentorAvailability } from "../services/sme_mentors.service";

/**
 * GET /api/mentors/public
 *
 * Unauthenticated endpoint for the landing page. Returns the same mentor list
 * but strips fields that should only be visible to authenticated users.
 */
export async function listMentorsPublic(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const mentors = await getMentorsList();
    const safe = mentors.map(({ id, fullName, avatarUrl, linkedinUrl, expertise, bio }) => ({
      id,
      fullName,
      avatarUrl,
      linkedinUrl,
      expertise,
      bio,
    }));
    res.json(safe);
  } catch (err) {
    next(err);
  }
}
import { bookSession, cancelSession, getSmeSessions } from "../services/mentor_sessions.service";

// ---------------------------------------------------------------------------
// Mentor discovery
// ---------------------------------------------------------------------------

/**
 * GET /api/mentors
 *
 * Returns the list of all mentor users with public profile fields.
 * Any authenticated user may call this endpoint.
 */
export async function listMentors(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const mentors = await getMentorsList();
    res.json(mentors);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/mentors/:id/availability
 *
 * Returns available slots for a specific mentor grouped by calendar date.
 * Any authenticated user may call this endpoint.
 */
export async function getMentorAvailabilityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getMentorAvailability(req.params["id"] as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Session management (SME side)
// ---------------------------------------------------------------------------

/**
 * POST /api/sessions
 *
 * Books a mentor availability slot for the authenticated SME user.
 * Expects `{ slotId: string }` in the request body (validated by Zod DTO upstream).
 */
export async function postBookSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await bookSession(req.user!.userId, req.body.slotId as string);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/sessions
 *
 * Returns the authenticated SME's sessions (upcoming and past) enriched with
 * slot timing and mentor details.
 */
export async function getSmeSessionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getSmeSessions(req.user!.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/sessions/:id/cancel
 *
 * Cancels a session on behalf of the authenticated SME user.
 */
export async function cancelSmeSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await cancelSession(req.user!.userId, req.params["id"] as string, "sme");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
