import express, { Router, type IRouter, type Request, type Response } from "express";
import type Stripe from "stripe";

import { stripe } from "../config/stripe";
import { logger } from "../config/logger";
import { AppError } from "../utils/app-error";
import { recordPaidOrder } from "../services/offers.service";

/**
 * POST /api/webhooks/stripe: Stripe's own confirmation of a paid offer.
 *
 * The learner's browser normally records the order (POST
 * /api/offers/:id/complete) right after paying; if it never does (tab
 * closed, connection lost), the payment would be taken with no order. On
 * `payment_intent.succeeded` this records the same order, through the same
 * recordPaidOrder: once per intent, whichever arrives first, with the
 * offerId/userId the intent was created with.
 *
 * Stripe signs the raw body with the endpoint's signing secret
 * (STRIPE_WEBHOOK_SECRET, "whsec_..."); anything that fails
 * stripe.webhooks.constructEvent(Async) is a 400. Without the secret the endpoint
 * answers 503 and records nothing. Mounted in index.ts before the JSON
 * parser and the Origin check (Stripe sends no Origin).
 *
 * Answers: 200 once handled or ignored (other events, intents that aren't
 * Hadafi offer payments). An order that can't be recorded for a reason a
 * retry won't fix (e.g. the learner no longer has the points) is logged as
 * an error for someone to resolve with the learner, and answered 200 so
 * Stripe stops retrying. Anything else (database down) is a 500, so Stripe
 * retries later.
 */
const router: IRouter = Router();

router.post("/", express.raw({ type: "*/*", limit: "1mb" }), async (req: Request, res: Response) => {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) {
    res.status(503).json({ success: false, error: { message: "Stripe webhook is not configured", code: "NOT_CONFIGURED" } });
    return;
  }
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string" || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ success: false, error: { message: "Missing Stripe signature", code: "BAD_SIGNATURE" } });
    return;
  }

  let event: Stripe.Event;
  try {
    // The async form works on every runtime (Node's crypto or Web Crypto under Bun).
    event = await stripe.webhooks.constructEventAsync(req.body, signature, secret);
  } catch {
    res.status(400).json({ success: false, error: { message: "Invalid Stripe signature", code: "BAD_SIGNATURE" } });
    return;
  }

  if (event.type !== "payment_intent.succeeded") {
    res.json({ received: true });
    return;
  }

  const pi = event.data.object;
  // Only intents createPaymentIntent made for an offer carry these.
  if (!pi.metadata?.["offerId"] && !pi.metadata?.["userId"]) {
    res.json({ received: true });
    return;
  }

  try {
    const result = await recordPaidOrder(pi);
    logger.info({ eventId: event.id, paymentIntent: pi.id, alreadyRecorded: result.alreadyRecorded }, "[stripe-webhook] offer payment recorded");
    res.json({ received: true });
  } catch (err) {
    if (err instanceof AppError && err.statusCode < 500) {
      logger.error(
        { eventId: event.id, paymentIntent: pi.id, code: err.code, offerId: pi.metadata?.["offerId"], userId: pi.metadata?.["userId"] },
        "[stripe-webhook] paid offer NOT recorded; needs a person to resolve it with the learner (refund or manual order)",
      );
      res.json({ received: true });
      return;
    }
    logger.error({ err, eventId: event.id, paymentIntent: pi.id }, "[stripe-webhook] failed; Stripe will retry");
    res.status(500).json({ success: false, error: { message: "Could not record the payment yet", code: "RETRY" } });
  }
});

export default router;
