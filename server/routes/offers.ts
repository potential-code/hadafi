import { Router } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { perUser, HOUR, DAY } from "../middleware/limits";
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
// Each paid-offer call creates a PaymentIntent in Stripe: 10 an hour and 30
// a day per learner is far more than buying offers needs.
export const PAYMENT_INTENT_LIMITS = { perHour: 10, perDay: 30 } as const;
const paymentIntentLimit = [
  perUser("offer-payment-intent:h", HOUR, PAYMENT_INTENT_LIMITS.perHour),
  perUser("offer-payment-intent:d", DAY, PAYMENT_INTENT_LIMITS.perDay, "You've reached today's limit for this. Please try again tomorrow."),
];

router.post(
  "/:id/payment-intent",
  authenticate,
  requireRole("sme"),
  ...paymentIntentLimit,
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
