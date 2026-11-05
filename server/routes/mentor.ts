import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import {
  getSetupToken,
  getAnalytics,
  postAvailability,
  getAvailability,
  deleteAvailabilitySlot,
  bulkDeleteAvailability,
  getMentorSessionsList,
  cancelMentorSession,
  completeMentorSession,
  patchSessionNotes,
  getMenteeNotesHandler,
  putMenteeNotesHandler,
  postProfilePhoto,
} from "../controllers/mentor.controller";
import { uploadAvatar } from "../middleware/upload";
import { MAX_NOTES_LENGTH } from "../services/mentor_notes.service";
import { AppError } from "../utils/app-error";

const router = Router();

/** Validate token query param presence before hitting the controller. */
function requireTokenParam(
  req: import("express").Request,
  _res: import("express").Response,
  next: import("express").NextFunction,
) {
  const token = req.query["token"];
  if (!token || typeof token !== "string" || token.trim() === "") {
    return next(new AppError("token query parameter is required", 422, "VALIDATION_ERROR"));
  }
  next();
}

// DTO schemas
const addSlotsDto = z.object({
  slots: z
    .array(
      z.object({
        startsAt: z.string().datetime({ message: "startsAt must be an ISO datetime string" }),
      }),
    )
    .min(1, "At least one slot is required"),
});

const notesDto = z.object({
  notes: z.string().max(MAX_NOTES_LENGTH, `Notes must be ${MAX_NOTES_LENGTH} characters or fewer`),
});

/** Rejects non-UUID path ids with 404 before they reach Postgres (which would 500 on a bad uuid). */
function requireUuidParam(name: string) {
  return (
    req: import("express").Request,
    _res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    const value = req.params[name];
    if (typeof value !== "string" || !z.string().uuid().safeParse(value).success) {
      return next(new AppError("Not found", 404, "NOT_FOUND"));
    }
    next();
  };
}

const bulkDeleteDto = z.object({
  ids: z.array(z.string().uuid()).min(1, "At least one ID is required"),
});

// Public routes — no authenticate middleware (mentor has no account yet)
router.get("/setup-token", requireTokenParam, getSetupToken);
// Completing setup is POST /api/auth/hadafi/mentor-setup (server/auth/hadafiPlugin.ts).

// Protected analytics route
router.get("/analytics", authenticate, requireRole("mentor"), getAnalytics);

// Availability routes — bulk-delete MUST be before /:id to avoid Express
// matching the literal string "bulk-delete" as the :id parameter.
router.post(
  "/availability/bulk-delete",
  authenticate,
  requireRole("mentor"),
  validate(bulkDeleteDto),
  bulkDeleteAvailability,
);
router.get("/availability", authenticate, requireRole("mentor"), getAvailability);
router.post(
  "/availability",
  authenticate,
  requireRole("mentor"),
  validate(addSlotsDto),
  postAvailability,
);
router.delete("/availability/:id", authenticate, requireRole("mentor"), deleteAvailabilitySlot);

// Sessions list
router.get("/sessions", authenticate, requireRole("mentor"), getMentorSessionsList);

// Session state transitions (Phase 3 — stubs registered now so the route
// table is complete)
router.patch("/sessions/:id/cancel", authenticate, requireRole("mentor"), cancelMentorSession);
router.patch(
  "/sessions/:id/complete",
  authenticate,
  requireRole("mentor"),
  completeMentorSession,
);

// Private notes — mentor-only, own sessions / own mentees only (checked in the service).
router.patch(
  "/sessions/:id/notes",
  authenticate,
  requireRole("mentor"),
  requireUuidParam("id"),
  validate(notesDto),
  patchSessionNotes,
);
router.get(
  "/mentees/:menteeId/notes",
  authenticate,
  requireRole("mentor"),
  requireUuidParam("menteeId"),
  getMenteeNotesHandler,
);
router.put(
  "/mentees/:menteeId/notes",
  authenticate,
  requireRole("mentor"),
  requireUuidParam("menteeId"),
  validate(notesDto),
  putMenteeNotesHandler,
);

// Profile photo (multipart, field "photo").
router.post("/profile/photo", authenticate, requireRole("mentor"), uploadAvatar, postProfilePhoto);

export default router;
