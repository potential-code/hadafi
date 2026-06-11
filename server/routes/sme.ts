import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
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
// Mentor discovery — any authenticated user may view mentors and their slots
// ---------------------------------------------------------------------------

/** GET /api/mentors/public — unauthenticated, landing page use only */
router.get("/mentors/public", listMentorsPublic);

/** GET /api/mentors — list all mentor users */
router.get("/mentors", authenticate, listMentors);

/** GET /api/mentors/:id/availability — get available slots for a specific mentor */
router.get("/mentors/:id/availability", authenticate, getMentorAvailabilityHandler);

// ---------------------------------------------------------------------------
// SME session management
// ---------------------------------------------------------------------------

/** POST /api/sessions — book a slot (SME only) */
router.post("/sessions", authenticate, requireRole("sme"), validate(bookSessionDto), postBookSession);

/** GET /api/sessions — list the authenticated SME's sessions */
router.get("/sessions", authenticate, requireRole("sme"), getSmeSessionsHandler);

/** PATCH /api/sessions/:id/cancel — cancel a session (SME side) */
router.patch("/sessions/:id/cancel", authenticate, requireRole("sme"), cancelSmeSession);

export default router;
