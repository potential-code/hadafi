import type { Request, Response, NextFunction } from "express";

import * as offersService from "../services/offers.service";

// ---------------------------------------------------------------------------
// Public handlers (no authentication required)
// ---------------------------------------------------------------------------

/**
 * GET /api/offers/public
 *
 * Returns all published offers for the landing page. No auth required.
 */
export async function listPublicOffers(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await offersService.listPublicOffers();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// SME-facing handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/offers
 *
 * Returns the authenticated user's point balance and all published offers,
 * each annotated with how many times this user has redeemed it.
 */
export async function listOffers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await offersService.listPublishedOffers(req.user!.userId); // ! safe: authenticate guarantees user
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/offers/:id
 *
 * Returns a single offer by ID (any status). Responds 404 if not found.
 */
export async function getOffer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const offer = await offersService.getOfferById(req.params["id"] as string, true);
    res.status(200).json({ success: true, data: offer });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/offers/:id/payment-intent
 *
 * For a paid offer: creates and returns a Stripe PaymentIntent client secret.
 * For a free offer: returns `{ free: true }` so the frontend can skip payment.
 *
 * Restricted to SME role — only SMEs purchase offers.
 */
export async function createPaymentIntent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await offersService.createPaymentIntent(
      req.params["id"] as string,
      req.user!.userId, // ! safe: authenticate guarantees user
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/offers/:id/complete
 *
 * Atomically deducts points and records a redemption after payment is
 * confirmed. Accepts an optional `paymentIntentId` in the body for paid
 * offers; omit for free offers.
 *
 * Restricted to SME role.
 */
export async function completeOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      paymentIntentId,
      billingFirstName,
      billingLastName,
      billingEmail,
      billingPhone,
      billingCompany,
      billingCountry,
      billingNotes,
    } = req.body as {
      paymentIntentId?: string;
      billingFirstName?: string;
      billingLastName?: string;
      billingEmail?: string;
      billingPhone?: string;
      billingCompany?: string;
      billingCountry?: string;
      billingNotes?: string;
    };
    const result = await offersService.completeOrder(
      req.params["id"] as string,
      req.user!.userId, // ! safe: authenticate guarantees user
      paymentIntentId,
      {
        firstName: billingFirstName,
        lastName: billingLastName,
        email: billingEmail,
        phone: billingPhone,
        company: billingCompany,
        country: billingCountry,
        notes: billingNotes,
      },
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Admin handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/offers
 *
 * Returns all offers (any status) with total redemption counts across all users.
 * Restricted to admin role via the admin router middleware.
 */
export async function adminListOffers(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await offersService.adminListOffers();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/offers
 *
 * Creates a new offer. Body is validated by `createOfferDto` in the routes file.
 */
export async function adminCreateOffer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const offer = await offersService.adminCreateOffer(req.body);
    res.status(201).json({ success: true, data: offer });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/offers/:id
 *
 * Partially updates an offer. Body is validated by `updateOfferDto` in the routes file.
 */
export async function adminUpdateOffer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const offer = await offersService.adminUpdateOffer(
      req.params["id"] as string,
      req.body,
    );
    res.status(200).json({ success: true, data: offer });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/offers/:id
 *
 * Permanently deletes an offer and its redemption records (cascaded by FK).
 */
export async function adminDeleteOffer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await offersService.adminDeleteOffer(req.params["id"] as string);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
