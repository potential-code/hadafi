import { eq, and, count, desc, sql, type SQL } from "drizzle-orm";
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
    // platform: the Stripe account is shared with Potential's other sites, so
    // the webhook (routes/stripeWebhook.ts) only handles intents tagged hadafi.
    metadata: { offerId, userId, platform: STRIPE_PLATFORM_TAG },
  });

  if (!pi.client_secret) {
    throw new AppError("Failed to create payment intent", 500, "STRIPE_ERROR");
  }

  return { clientSecret: pi.client_secret };
}

export interface BillingDetails {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  country?: string;
  notes?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PI_ALREADY_USED = () =>
  new AppError("Payment intent has already been used", 409, "PAYMENT_INTENT_ALREADY_USED");

const billingColumns = (billing?: BillingDetails) => ({
  billingFirstName: billing?.firstName ?? null,
  billingLastName: billing?.lastName ?? null,
  billingEmail: billing?.email ?? null,
  billingPhone: billing?.phone ?? null,
  billingCompany: billing?.company ?? null,
  billingCountry: billing?.country ?? null,
  billingNotes: billing?.notes ?? null,
});

/** The order confirmation email; fire-and-forget (a mail failure never undoes an order). */
function sendOrderEmail(
  user: { email: string; fullName: string },
  offer: Offer,
  billing?: BillingDetails,
): void {
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
}

/**
 * The order already recorded for this PaymentIntent, if any. It must be the
 * same learner's order for the same offer (else 409). Billing details sent
 * now fill in any the order doesn't have yet (the Stripe webhook records an
 * order without them when it arrives before /complete).
 */
async function existingPaidOrder(
  paymentIntentId: string,
  offerId: string,
  userId: string,
  billing?: BillingDetails,
): Promise<{ pointsDeducted: number } | null> {
  const [row] = await db
    .select({ id: offerRedemptions.id, userId: offerRedemptions.userId, offerId: offerRedemptions.offerId, pointsDeducted: offerRedemptions.pointsDeducted })
    .from(offerRedemptions)
    .where(eq(offerRedemptions.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (!row) return null;
  if (row.userId !== userId || row.offerId !== offerId) throw PI_ALREADY_USED();
  const given = billingColumns(billing);
  const fill: Partial<Record<keyof typeof given, SQL>> = {};
  for (const key of Object.keys(given) as Array<keyof typeof given>) {
    const value = given[key];
    if (value !== null) fill[key] = sql`coalesce(${offerRedemptions[key]}, ${value})`;
  }
  if (Object.keys(fill).length > 0) {
    await db.update(offerRedemptions).set(fill).where(eq(offerRedemptions.id, row.id));
  }
  return { pointsDeducted: row.pointsDeducted };
}

/**
 * Records a succeeded Stripe PaymentIntent as the learner's order, exactly
 * once. Both POST /api/offers/:id/complete and the Stripe webhook
 * (routes/stripeWebhook.ts) come through here, in either order:
 *  1. The intent must have succeeded and carry the offerId and userId it was
 *     created with (createPaymentIntent sets them); when the caller expects a
 *     particular offer and learner, they must match (no reusing someone
 *     else's payment).
 *  2. An order already recorded for this intent is returned as it is
 *     (idempotent; the partial unique index offer_redemptions_pi_unique_idx
 *     guarantees one order per intent, even for two callers at once).
 *  3. Otherwise points are deducted (only if the learner still has enough)
 *     and the order is inserted in one transaction, and the confirmation
 *     email goes out.
 */
/** Tag on every PaymentIntent Hadafi creates; other apps share the Stripe account. */
export const STRIPE_PLATFORM_TAG = "hadafi";

export async function recordPaidOrder(
  pi: Stripe.PaymentIntent,
  opts: { expect?: { offerId: string; userId: string }; billing?: BillingDetails } = {},
): Promise<{ pointsDeducted: number; alreadyRecorded: boolean }> {
  if (pi.status !== "succeeded") {
    throw new AppError("Payment not confirmed", 402, "PAYMENT_NOT_CONFIRMED");
  }
  const meta = (pi.metadata ?? {}) as Record<string, string | undefined>;
  const offerId = meta["offerId"];
  const userId = meta["userId"];
  if (
    !offerId || !userId || !UUID_RE.test(offerId) || !UUID_RE.test(userId) ||
    (opts.expect && (opts.expect.offerId !== offerId || opts.expect.userId !== userId))
  ) {
    throw new AppError("Payment intent mismatch", 400, "PAYMENT_MISMATCH");
  }

  const existing = await existingPaidOrder(pi.id, offerId, userId, opts.billing);
  if (existing) return { ...existing, alreadyRecorded: true };

  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId));
  if (!offer) throw new AppError("Offer not found", 404, "OFFER_NOT_FOUND");
  const [user] = await db
    .select({ id: users.id, points: users.points, email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  if (user.points < offer.pointsCost) {
    throw new AppError("Insufficient points", 400, "INSUFFICIENT_POINTS");
  }

  try {
    await db.transaction(async (tx) => {
      // Deduct only if the learner STILL has enough points at write time, so
      // two concurrent orders can't drive the balance negative.
      const updated = await tx
        .update(users)
        .set({ points: sql`${users.points} - ${offer.pointsCost}`, updatedAt: sql`now()` })
        .where(and(eq(users.id, userId), sql`${users.points} >= ${offer.pointsCost}`))
        .returning({ newPoints: users.points });
      if (updated.length === 0) {
        throw new AppError("Insufficient points", 400, "INSUFFICIENT_POINTS");
      }
      await tx.insert(offerRedemptions).values({
        userId,
        offerId,
        pointsDeducted: offer.pointsCost,
        // The amount Stripe actually charged (cents), not the listed price.
        amountCharged: pi.amount,
        stripePaymentIntentId: pi.id,
        orderStatus: "paid",
        ...billingColumns(opts.billing),
      });
    });
  } catch (err) {
    // The other caller (webhook or /complete) recorded it first: the unique
    // index refused this insert and rolled back this deduction.
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === "23505" && pgErr.constraint?.includes("offer_redemptions_pi_unique_idx")) {
      const raced = await existingPaidOrder(pi.id, offerId, userId, opts.billing);
      if (raced) return { ...raced, alreadyRecorded: true };
      throw PI_ALREADY_USED();
    }
    throw err;
  }

  sendOrderEmail(user, offer, opts.billing);
  return { pointsDeducted: offer.pointsCost, alreadyRecorded: false };
}

/**
 * Completes an offer purchase for the signed-in learner:
 *  - a free offer: checks points, then deducts them and records the order in
 *    one transaction;
 *  - a paid offer: retrieves the PaymentIntent from Stripe and records it
 *    through recordPaidOrder, which checks it succeeded and belongs to this
 *    offer and learner. Calling again for the same intent (or after the
 *    Stripe webhook recorded it) returns the same order, without charging
 *    points twice.
 *
 * @param offerId          - UUID of the offer being redeemed.
 * @param userId           - UUID of the authenticated SME.
 * @param paymentIntentId  - Stripe PI id, required for paid offers.
 * @returns `{ success: true, pointsDeducted: number }`
 */
export async function completeOrder(
  offerId: string,
  userId: string,
  paymentIntentId?: string,
  billing?: BillingDetails,
): Promise<{ success: true; pointsDeducted: number }> {
  const [offer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.status, "published")));

  if (!offer) {
    throw new AppError("Offer not found", 404, "OFFER_NOT_FOUND");
  }

  if (offer.price > 0) {
    // A paid offer always needs its intent: never a free redemption of a paid offer.
    if (!paymentIntentId) {
      throw new AppError("Payment intent required for paid offers", 400, "PAYMENT_INTENT_REQUIRED");
    }
    // Verified with Stripe before any transaction is opened.
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const { pointsDeducted } = await recordPaidOrder(pi, { expect: { offerId, userId }, billing });
    return { success: true, pointsDeducted };
  }

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

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ points: sql`${users.points} - ${offer.pointsCost}`, updatedAt: sql`now()` })
      .where(and(eq(users.id, userId), sql`${users.points} >= ${offer.pointsCost}`))
      .returning({ newPoints: users.points });

    if (updated.length === 0) {
      throw new AppError("Insufficient points", 400, "INSUFFICIENT_POINTS");
    }

    await tx.insert(offerRedemptions).values({
      userId,
      offerId,
      pointsDeducted: offer.pointsCost,
      amountCharged: 0,
      stripePaymentIntentId: null,
      orderStatus: "free",
      ...billingColumns(billing),
    });
  });

  sendOrderEmail(user, offer, billing);
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
