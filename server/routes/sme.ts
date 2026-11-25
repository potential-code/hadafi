import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { emptyListWhenHumanMentorsOff, requireHumanMentors } from "../middleware/humanMentors";
import {
  listMentors,
  listMentorsPublic,
  getMentorAvailabilityHandler,
  postBookSession,
  getSmeSessionsHandler,
  cancelSmeSession,
} from "../controllers/sme_mentors.controller";

const router = Router();

/** DTO for booking a session: body must contain a valid UUID slot ID. */
const bookSessionDto = z.object({
  slotId: z.string().uuid("slotId must be a valid UUID"),
});

// ---------------------------------------------------------------------------
// Mentor discovery — any authenticated user may view mentors and their slots.
// While human mentors are off (HUMAN_MENTORS_ENABLED) the lists are empty and
// open times and booking are refused; existing sessions can still be listed
// and cancelled.
// ---------------------------------------------------------------------------

/** GET /api/mentors/public — unauthenticated, landing page use only */
router.get("/mentors/public", emptyListWhenHumanMentorsOff, listMentorsPublic);

/** GET /api/mentors — list all mentor users */
router.get("/mentors", authenticate, emptyListWhenHumanMentorsOff, listMentors);

/** GET /api/mentors/:id/availability — get available slots for a specific mentor */
router.get("/mentors/:id/availability", authenticate, requireHumanMentors, getMentorAvailabilityHandler);

// ---------------------------------------------------------------------------
// SME session management
// ---------------------------------------------------------------------------

/** POST /api/sessions — book a slot (SME only) */
router.post("/sessions", authenticate, requireRole("sme"), requireHumanMentors, validate(bookSessionDto), postBookSession);

/** GET /api/sessions — list the authenticated SME's sessions */
router.get("/sessions", authenticate, requireRole("sme"), getSmeSessionsHandler);

/** PATCH /api/sessions/:id/cancel — cancel a session (SME side) */
router.patch("/sessions/:id/cancel", authenticate, requireRole("sme"), cancelSmeSession);

export default router;
