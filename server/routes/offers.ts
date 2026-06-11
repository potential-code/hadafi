import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import * as ctrl from "../controllers/offers.controller";

const router = Router();

/**
 * DTO for completing an offer order.
 * `paymentIntentId` is present for paid offers, omitted for free ones.
 */
const completeOrderDto = z.object({
  paymentIntentId: z.string().regex(/^pi_[a-zA-Z0-9_]+$/).optional(),
  billingFirstName: z.string().max(100).optional(),
  billingLastName: z.string().max(100).optional(),
  billingEmail: z.string().email().optional(),
  billingPhone: z.string().max(30).optional(),
  billingCompany: z.string().max(150).optional(),
  billingCountry: z.string().max(100).optional(),
  billingNotes: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Public routes (no authentication required)
// Defined before /:id so "public" is not consumed as a param.
// ---------------------------------------------------------------------------

/**
 * GET /api/offers/public
 * Returns all published offers for the landing page. No auth required.
 */
router.get("/public", ctrl.listPublicOffers);

// ---------------------------------------------------------------------------
// SME-facing routes
// All routes in this file require authentication.
// ---------------------------------------------------------------------------

/**
 * GET /api/offers
 * Returns the user's points balance + all published offers with per-user
 * redemption counts. Available to any authenticated user.
 */
router.get("/", authenticate, ctrl.listOffers);

/**
 * GET /api/offers/:id
 * Returns a single offer by ID (any status). Available to any authenticated user.
 */
router.get("/:id", authenticate, ctrl.getOffer);

/**
 * POST /api/offers/:id/payment-intent
 * Creates a Stripe PaymentIntent for a paid offer, or signals free.
 * Restricted to SME role — only SMEs purchase offers.
 */
router.post(
  "/:id/payment-intent",
  authenticate,
  requireRole("sme"),
  ctrl.createPaymentIntent,
);

/**
 * POST /api/offers/:id/complete
 * Deducts points and records a redemption after payment is confirmed.
 * Restricted to SME role.
 */
router.post(
  "/:id/complete",
  authenticate,
  requireRole("sme"),
  validate(completeOrderDto),
  ctrl.completeOrder,
);

export default router;
