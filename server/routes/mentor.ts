import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import {
  getSetupToken,
  postSetup,
  getAnalytics,
  postAvailability,
  getAvailability,
  deleteAvailabilitySlot,
  bulkDeleteAvailability,
  getMentorSessionsList,
  cancelMentorSession,
  completeMentorSession,
} from "../controllers/mentor.controller";
import { AppError } from "../utils/app-error";

const router = Router();

const setupDto = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

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

const bulkDeleteDto = z.object({
  ids: z.array(z.string().uuid()).min(1, "At least one ID is required"),
});

// Public routes — no authenticate middleware (mentor has no account yet)
router.get("/setup-token", requireTokenParam, getSetupToken);
router.post("/setup", validate(setupDto), postSetup);

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

export default router;
