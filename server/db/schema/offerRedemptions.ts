import { pgTable, uuid, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { offers } from "./offers";

export const offerRedemptions = pgTable(
  "offer_redemptions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    pointsDeducted: integer("points_deducted").notNull(), // snapshot of pointsCost at redemption time
    amountCharged: integer("amount_charged").notNull(), // USD cents charged (0 for free)
    stripePaymentIntentId: text("stripe_payment_intent_id"), // null for free orders
    orderStatus: text("order_status").notNull(), // 'paid' | 'free'
    billingFirstName: text("billing_first_name"),
    billingLastName: text("billing_last_name"),
    billingEmail: text("billing_email"),
    billingPhone: text("billing_phone"),
    billingCompany: text("billing_company"),
    billingCountry: text("billing_country"),
    billingNotes: text("billing_notes"),
    redeemedAt: timestamp("redeemed_at").notNull().default(sql`now()`),
    // Free-offer redemptions (null PI) remain non-unique — only paid-offer PIs are
    // constrained to be used exactly once (partial index, see config callback below).
  },
  (table) => [
    // Partial unique index: a Stripe PaymentIntent may only appear once in the
    // redemptions table. NULLs (free orders) are excluded from uniqueness so the
    // same SME can redeem multiple free offers without a conflict.
    uniqueIndex("offer_redemptions_pi_unique_idx")
      .on(table.stripePaymentIntentId)
      .where(sql`${table.stripePaymentIntentId} IS NOT NULL`),
  ],
);

export type OfferRedemption = typeof offerRedemptions.$inferSelect;
export type InsertOfferRedemption = typeof offerRedemptions.$inferInsert;
