import { eq, and, count, desc, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "../db";
import { offers, offerRedemptions, users } from "../db/schema";
import type { Offer, InsertOffer } from "../db/schema/offers";
import { AppError } from "../utils/app-error";
import { stripe } from "../config/stripe";
import { sendMail } from "../mail/mailer";

// ---------------------------------------------------------------------------
// Return-type interfaces
// ---------------------------------------------------------------------------

/** Offer row augmented with how many times the requesting user has redeemed it. */
export interface OfferWithRedemptions extends Offer {
  timesRedeemed: number;
}

/** Offer row augmented with total redemption count across all users (admin view). */
export interface OfferWithCount extends Offer {
  redemptionCount: number;
}

/** Payload used when creating a new offer. */
export type CreateOfferDto = Pick<
  InsertOffer,
  "title" | "category" | "priceLabel" | "price" | "pointsCost" | "status"
> & { imageUrl?: string; priceBefore?: string | null };

/** Payload used when partially updating an existing offer. */
export type UpdateOfferDto = Partial<CreateOfferDto>;

// ---------------------------------------------------------------------------
// SME-facing service functions
// ---------------------------------------------------------------------------

/**
 * Returns the requesting user's current points balance alongside all published
 * offers, each annotated with how many times that specific user has redeemed it.
 *
 * The redemption count is fetched with a separate per-offer count query.
 * For the number of offers we expect (< 100), this is negligible overhead and
 * keeps the query straightforward.
 *
 * @param userId - UUID of the authenticated SME.
 */

/**
 * Returns all published offers for the public landing page — no auth required,
 * no user-specific data (points, redemption counts) included.
 */
export async function listPublicOffers(): Promise<Offer[]> {
  return db
    .select()
    .from(offers)
    .where(eq(offers.status, "published"))
    .orderBy(desc(offers.createdAt));
}

export async function listPublishedOffers(
  userId: string,
): Promise<{ userPoints: number; offers: OfferWithRedemptions[] }> {
  // Fetch user points and all published offers in parallel — independent queries.
  const [userRows, offerRows] = await Promise.all([
    db
      .select({ points: users.points })
      .from(users)
      .where(eq(users.id, userId)),
    db
      .select()
      .from(offers)
      .where(eq(offers.status, "published"))
      .orderBy(desc(offers.createdAt)),
  ]);

  const userPoints = userRows[0]?.points ?? 0;

  // Count redemptions per offer for this user in one aggregated query.
  const redemptionCounts = await db
    .select({
      offerId: offerRedemptions.offerId,
      cnt: count(offerRedemptions.id),
    })
    .from(offerRedemptions)
    .where(eq(offerRedemptions.userId, userId))
    .groupBy(offerRedemptions.offerId);

  // Build a lookup map for O(1) access when annotating offer rows.
  const countByOfferId = new Map<string, number>(
    redemptionCounts.map((r) => [r.offerId, Number(r.cnt)]),
  );

  const annotated: OfferWithRedemptions[] = offerRows.map((o) => ({
    ...o,
    timesRedeemed: countByOfferId.get(o.id) ?? 0,
  }));

  return { userPoints, offers: annotated };
}

/**
 * Returns a single offer by ID.
 * Throws OFFER_NOT_FOUND if no row matches.
 *
 * @param id               - UUID of the offer.
 * @param requirePublished - When true, also filters by `status = 'published'`.
 *                           Use for SME-facing endpoints so draft/archived offers
 *                           are never exposed. Defaults to false (admin use-cases).
 */
export async function getOfferById(id: string, requirePublished = false): Promise<Offer> {
  const whereClause = requirePublished
    ? and(eq(offers.id, id), eq(offers.status, "published"))
    : eq(offers.id, id);

  const [offer] = await db
    .select()
    .from(offers)
    .where(whereClause);

  if (!offer) {
    throw new AppError("Offer not found", 404, "OFFER_NOT_FOUND");
  }

  return offer;
}

/**
 * Creates a Stripe PaymentIntent for a paid offer, or signals that the offer
 * is free so the frontend can skip the payment step.
 *
 * @param offerId - UUID of the offer being purchased.
 * @param userId  - UUID of the authenticated SME.
 * @returns `{ free: true }` for free offers, `{ clientSecret: string }` for paid.
 */
export async function createPaymentIntent(
  offerId: string,
  userId: string,
): Promise<{ free: true } | { clientSecret: string }> {
  const [offer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.status, "published")));

  if (!offer) {
    throw new AppError("Offer not found", 404, "OFFER_NOT_FOUND");
  }

  // Pre-check: verify the user exists and has enough points before touching Stripe.
  // Applies to both free and paid offers — an SME who can't afford an offer should be
  // blocked at the intent-creation stage, not only at order completion.
  const [userForPointsCheck] = await db
    .select({ points: users.points })
    .from(users)
    .where(eq(users.id, userId));

  if (!userForPointsCheck) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  if (userForPointsCheck.points < offer.pointsCost) {
    throw new AppError("Insufficient points", 400, "INSUFFICIENT_POINTS");
  }

  // Free offer — no Stripe involvement needed.
  if (offer.price === 0) {
    return { free: true };
  }

  // Paid offer — create a PaymentIntent. Amount is already stored in cents.
  const pi = await stripe.paymentIntents.create({
    amount: offer.price,
    currency: "usd",
    metadata: { offerId, userId },
  });

  if (!pi.client_secret) {
    throw new AppError("Failed to create payment intent", 500, "STRIPE_ERROR");
  }

  return { clientSecret: pi.client_secret };
}

/**
 * Atomically completes an offer purchase:
 *  1. Verifies the offer exists and is published.
 *  2. Verifies the user exists and has enough points.
 *  3. For paid offers, verifies the Stripe PaymentIntent succeeded and is
 *     scoped to this offer + user (prevents intent reuse attacks).
 *  4. Deducts points and inserts a redemption record inside a single transaction.
 *
 * @param offerId          - UUID of the offer being redeemed.
 * @param userId           - UUID of the authenticated SME.
 * @param paymentIntentId  - Stripe PI id, required for paid offers.
 * @returns `{ success: true, pointsDeducted: number }`
 */
export interface BillingDetails {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  country?: string;
  notes?: string;
}

export async function completeOrder(
  offerId: string,
  userId: string,
  paymentIntentId?: string,
  billing?: BillingDetails,
): Promise<{ success: true; pointsDeducted: number }> {
  // Pre-transaction reads — verify offer and user exist before acquiring locks.
  const [offer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.status, "published")));

  if (!offer) {
    throw new AppError("Offer not found", 404, "OFFER_NOT_FOUND");
  }

  // Change C: explicitly select only the fields we need (email + fullName for the
  // confirmation email; points for the pre-check) rather than selecting all columns.
  const [user] = await db
    .select({ id: users.id, points: users.points, email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  if (user.points < offer.pointsCost) {
    throw new AppError("Insufficient points", 400, "INSUFFICIENT_POINTS");
  }

  // Hoist resolvedPi so we can use pi.amount inside the transaction INSERT which
  // lives outside the `if (offer.price > 0)` block.
  let resolvedPi: Stripe.PaymentIntent | undefined;

  // Change A: for paid offers, require a paymentIntentId — the old guard silently
  // skipped Stripe verification when no intent was supplied, allowing free redemption
  // of paid offers. Now we hard-fail if the intent is missing.
  if (offer.price > 0) {
    if (!paymentIntentId) {
      throw new AppError(
        "Payment intent required for paid offers",
        400,
        "PAYMENT_INTENT_REQUIRED",
      );
    }

    // For paid offers, verify the PaymentIntent before entering the transaction.
    // This avoids holding a DB transaction open while making a network call to Stripe.
    resolvedPi = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (resolvedPi.status !== "succeeded") {
      throw new AppError("Payment not confirmed", 402, "PAYMENT_NOT_CONFIRMED");
    }

    // Validate that the PI was created for this exact offer + user to prevent
    // a user from reusing another user's payment intent.
    const meta = resolvedPi.metadata as Record<string, string>;
    if (meta["offerId"] !== offerId || meta["userId"] !== userId) {
      throw new AppError("Payment intent mismatch", 400, "PAYMENT_MISMATCH");
    }

    // Replay pre-check: if this PI already has a redemption record, reject immediately
    // before entering the transaction. The partial unique index (offer_redemptions_pi_unique_idx)
    // is the DB-level guard; this is the app-level early exit for a cleaner 409 response.
    const existingRedemption = await db
      .select({ id: offerRedemptions.id })
      .from(offerRedemptions)
      .where(eq(offerRedemptions.stripePaymentIntentId, paymentIntentId))
      .limit(1);

    if (existingRedemption.length > 0) {
      throw new AppError(
        "Payment intent has already been used",
        409,
        "PAYMENT_INTENT_ALREADY_USED",
      );
    }
  }

  // Atomic: deduct points + record redemption in one transaction.
  // Wrapped in try/catch to convert Postgres unique-constraint violations on
  // offer_redemptions_pi_unique_idx into a clean 409 — a safety net for the
  // rare race where two requests clear the replay pre-check simultaneously.
  try {
    await db.transaction(async (tx) => {
      // Change B: race-condition-proof points deduction — the WHERE clause ensures the
      // UPDATE only executes if the user STILL has enough points at write time, preventing
      // two concurrent requests from both passing the pre-check and driving the balance negative.
      const updated = await tx
        .update(users)
        .set({
          points: sql`${users.points} - ${offer.pointsCost}`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(users.id, userId), sql`${users.points} >= ${offer.pointsCost}`))
        .returning({ newPoints: users.points });

      if (updated.length === 0) {
        throw new AppError("Insufficient points", 400, "INSUFFICIENT_POINTS");
      }

      await tx.insert(offerRedemptions).values({
        userId,
        offerId,
        pointsDeducted: offer.pointsCost,
        // Use the actual amount charged as reported by Stripe (in cents) rather
        // than the offer's listed price, to handle any discrepancies.
        amountCharged: resolvedPi?.amount ?? 0,
        stripePaymentIntentId: paymentIntentId ?? null,
        orderStatus: offer.price > 0 ? "paid" : "free",
        billingFirstName: billing?.firstName ?? null,
        billingLastName: billing?.lastName ?? null,
        billingEmail: billing?.email ?? null,
        billingPhone: billing?.phone ?? null,
        billingCompany: billing?.company ?? null,
        billingCountry: billing?.country ?? null,
        billingNotes: billing?.notes ?? null,
      });
    });
  } catch (err) {
    // Translate DB unique-constraint violation on the PI index into a 409.
    // This is the safety net for concurrent duplicate submissions that both
    // cleared the app-level replay pre-check.
    const pgErr = err as { code?: string; constraint?: string };
    if (
      pgErr.code === "23505" &&
      pgErr.constraint?.includes("offer_redemptions_pi_unique_idx")
    ) {
      throw new AppError(
        "Payment intent has already been used",
        409,
        "PAYMENT_INTENT_ALREADY_USED",
      );
    }
    throw err;
  }

  // Change D: fire-and-forget confirmation email — a mail failure must never roll
  // back a successfully completed order, so we intentionally do not await this.
  sendMail({
    to: user.email,
    subject: `Your order is confirmed – ${offer.title}`,
    template: "offer-redeemed-sme",
    context: {
      smeName: user.fullName,
      offerTitle: offer.title,
      offerCategory: offer.category,
      pointsDeducted: offer.pointsCost.toLocaleString(),
      isPaid: offer.price > 0,
      amountCharged:
        offer.price > 0 ? `$${(offer.price / 100).toFixed(2)}` : null,
      billingName:
        billing?.firstName || billing?.lastName
          ? `${billing?.firstName ?? ""} ${billing?.lastName ?? ""}`.trim()
          : null,
      billingEmail: billing?.email ?? null,
      billingPhone: billing?.phone ?? null,
      billingCompany: billing?.company ?? null,
      billingCountry: billing?.country ?? null,
      billingNotes: billing?.notes ?? null,
    },
  }).catch((err) => {
    console.error({ err }, "Failed to send offer redemption email");
  });

  return { success: true, pointsDeducted: offer.pointsCost };
}

// ---------------------------------------------------------------------------
// Admin service functions
// ---------------------------------------------------------------------------

/**
 * Returns all offers (any status) ordered by creation date descending,
 * each annotated with the total redemption count across all users.
 */
export async function adminListOffers(): Promise<OfferWithCount[]> {
  const offerRows = await db
    .select()
    .from(offers)
    .orderBy(desc(offers.createdAt));

  // Aggregate total redemptions per offer across all users.
  const redemptionCounts = await db
    .select({
      offerId: offerRedemptions.offerId,
      cnt: count(offerRedemptions.id),
    })
    .from(offerRedemptions)
    .groupBy(offerRedemptions.offerId);

  const countByOfferId = new Map<string, number>(
    redemptionCounts.map((r) => [r.offerId, Number(r.cnt)]),
  );

  return offerRows.map((o) => ({
    ...o,
    redemptionCount: countByOfferId.get(o.id) ?? 0,
  }));
}

/**
 * Creates a new offer. Generates a URL-safe slug from the title.
 * If the slug collides with an existing one, appends -2, -3, … up to -10.
 *
 * @param dto - Validated offer creation payload.
 * @returns The newly inserted offer row.
 */
export async function adminCreateOffer(dto: CreateOfferDto): Promise<Offer> {
  const baseSlug = dto.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Try the base slug, then -2 through -10 on collision.
  const MAX_TRIES = 10;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    try {
      const [inserted] = await db
        .insert(offers)
        .values({ ...dto, slug })
        .returning();

      // inserted is guaranteed by .returning() when insert succeeds.
      return inserted as Offer;
    } catch (err: unknown) {
      // Postgres unique violation error code is '23505'.
      // Only retry on slug uniqueness conflicts; rethrow anything else.
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === "23505" && pgErr.constraint?.includes("slug")) {
        // Slug conflict — try the next suffix.
        continue;
      }
      throw err;
    }
  }

  throw new AppError(
    `Could not generate a unique slug for title "${dto.title}" after ${MAX_TRIES} attempts`,
    409,
    "SLUG_CONFLICT",
  );
}

/**
 * Updates an existing offer with the provided partial fields.
 * Always refreshes `updatedAt`.
 *
 * @param id  - UUID of the offer to update.
 * @param dto - Partial update payload (validated by caller).
 * @returns The updated offer row.
 */
export async function adminUpdateOffer(
  id: string,
  dto: UpdateOfferDto,
): Promise<Offer> {
  const existing = await db
    .select({ id: offers.id })
    .from(offers)
    .where(eq(offers.id, id));

  if (existing.length === 0) {
    throw new AppError("Offer not found", 404, "OFFER_NOT_FOUND");
  }

  const [updated] = await db
    .update(offers)
    .set({ ...dto, updatedAt: sql`now()` })
    .where(eq(offers.id, id))
    .returning();

  return updated as Offer;
}

/**
 * Permanently deletes an offer. Cascades to offerRedemptions via FK.
 *
 * @param id - UUID of the offer to delete.
 * @returns `{ success: true }`
 */
export async function adminDeleteOffer(id: string): Promise<{ success: true }> {
  const existing = await db
    .select({ id: offers.id })
    .from(offers)
    .where(eq(offers.id, id));

  if (existing.length === 0) {
    throw new AppError("Offer not found", 404, "OFFER_NOT_FOUND");
  }

  await db.delete(offers).where(eq(offers.id, id));

  return { success: true };
}
