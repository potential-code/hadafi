import { Router, type IRouter } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import * as adminController from "../controllers/admin.controller";
import * as offersCtrl from "../controllers/offers.controller";
import * as analyticsController from "../controllers/admin.analytics.controller";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Admin guard
// ---------------------------------------------------------------------------
// Every route in this file requires a valid JWT *and* the 'admin' role.
// These two middleware functions are applied once at the router level so they
// cannot be accidentally omitted from an individual route.
router.use(authenticate, requireRole("admin"));

// ---------------------------------------------------------------------------
// Invite code routes
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/invites
 * Lists all invite codes with optional usedBy user details.
 */
router.get("/invites", adminController.listInvites);

/**
 * POST /api/admin/invites
 * Creates a new invite code attributed to the requesting admin.
 */
router.post("/invites", adminController.createInvite);

// ---------------------------------------------------------------------------
// Mentor application routes
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/mentor-applications
 * Lists mentor applications. Accepts optional ?status= query param.
 */
router.get("/mentor-applications", adminController.listMentorApplications);

/**
 * POST /api/admin/mentor-applications/:id/approve
 * Approves a pending mentor application and emails the setup link.
 */
router.post("/mentor-applications/:id/approve", adminController.approveMentorApplication);

/**
 * POST /api/admin/mentor-applications/:id/reject
 * Rejects a mentor application.
 */
router.post("/mentor-applications/:id/reject", adminController.rejectMentorApplication);

// ---------------------------------------------------------------------------
// Stakeholder application routes
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/stakeholder-applications
 * Lists stakeholder registrations. Accepts optional ?type= query param.
 */
router.get("/stakeholder-applications", adminController.listStakeholderApplications);

// ---------------------------------------------------------------------------
// Offers CRUD routes
// ---------------------------------------------------------------------------

/** Valid category values for offers — mirrors the frontend constant. */
const OFFER_CATEGORIES = [
  "AI",
  "Marketing",
  "IT",
  "Finance",
  "PR",
  "Ecommerce",
  "Training",
] as const;

/**
 * DTO for creating a new offer.
 * `imageUrl` accepts a full URL, a local path starting with `/`, or an empty string (coerced to undefined).
 */
const createOfferDto = z.object({
  title: z.string().min(1).max(300).trim(),
  category: z.enum(OFFER_CATEGORIES),
  priceLabel: z.string().min(1).max(200).trim(),
  priceBefore: z.string().max(200).trim().optional(),
  price: z.number().int().min(0),
  pointsCost: z.number().int().min(0),
  imageUrl: z
    .string()
    .refine(
      (val) => val.startsWith('/') || z.string().url().safeParse(val).success,
      { message: "imageUrl must be a valid URL or a path starting with '/'" },
    )
    .optional()
    .or(z.literal("").transform(() => undefined)),
  status: z.enum(["published", "draft"]).default("published"),
});

/** DTO for partially updating an existing offer — all fields optional. */
const updateOfferDto = createOfferDto.partial();

/**
 * GET /api/admin/offers
 * Returns all offers (any status) with total redemption counts.
 */
router.get("/offers", offersCtrl.adminListOffers);

/**
 * POST /api/admin/offers
 * Creates a new offer. Slug is auto-generated from the title.
 */
router.post("/offers", validate(createOfferDto), offersCtrl.adminCreateOffer);

/**
 * PATCH /api/admin/offers/:id
 * Partially updates an existing offer.
 */
router.patch("/offers/:id", validate(updateOfferDto), offersCtrl.adminUpdateOffer);

/**
 * DELETE /api/admin/offers/:id
 * Permanently deletes an offer (cascades to redemptions).
 */
router.delete("/offers/:id", offersCtrl.adminDeleteOffer);

// ── Analytics routes ────────────────────────────────────────────────────────
/** GET /api/admin/stats — KPI counts for the Overview dashboard */
router.get("/stats", analyticsController.getKpiStats);

/** GET /api/admin/analytics/kpi-overview?range=7d|30d|12m */
router.get("/analytics/kpi-overview", analyticsController.getOverviewKpis);

/** GET /api/admin/analytics/user-growth?range=7d|30d|12m */
router.get("/analytics/user-growth", analyticsController.getUserGrowthTrend);

/** GET /api/admin/analytics/enrollments — monthly enrollments for Overview dashboard */
router.get("/analytics/enrollments", analyticsController.getEnrollmentTrend);

/** GET /api/admin/analytics/course-engagement — for Overview dashboard */
router.get("/analytics/course-engagement", analyticsController.getCourseEngagement);

/** GET /api/admin/analytics/course-completion?range=7d|30d|12m */
router.get("/analytics/course-completion", analyticsController.getCourseCompletionRates);

/** GET /api/admin/analytics/course-performance — all-time course table */
router.get("/analytics/course-performance", analyticsController.getCoursePerformance);

/** GET /api/admin/analytics/stakeholder-kpis — count per stakeholder type */
router.get("/analytics/stakeholder-kpis", analyticsController.getStakeholderKpis);

/** GET /api/admin/analytics/stakeholder-trend?range=7d|30d|12m */
router.get("/analytics/stakeholder-trend", analyticsController.getStakeholderTrend);

/** GET /api/admin/analytics/stakeholder-trend-by-type?range=7d|30d|12m */
router.get("/analytics/stakeholder-trend-by-type", analyticsController.getStakeholderTrendByType);

export default router;
