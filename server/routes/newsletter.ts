import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { newsletterSubscribers } from "../db/schema";
import { validate } from "../middleware/validate";
import { HOUR } from "../middleware/limits";

/**
 * POST /api/newsletter/subscribe { email }: the homepage "Stay in the loop" form
 * (ported from SMEEP). Public, so each network gets ten sign-ups an hour.
 * Signing up again keeps the address and re-activates one that unsubscribed.
 * The answer is the same whether or not the address was already on the list,
 * so the form can't be used to find out who is subscribed.
 */
const router: IRouter = Router();

const subscribeLimit = rateLimit({
  windowMs: HOUR,
  limit: process.env["NODE_ENV"] === "test" ? 10_000 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => `newsletter:${ipKeyGenerator(req.ip ?? "")}`,
  message: {
    success: false,
    error: { message: "Too many sign-ups from this network. Please try again later.", code: "RATE_LIMITED" },
  },
});

const subscribeDto = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();

router.post(
  "/subscribe",
  subscribeLimit,
  validate(subscribeDto),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as z.infer<typeof subscribeDto>;
      await db
        .insert(newsletterSubscribers)
        .values({ email, source: "homepage" })
        .onConflictDoUpdate({ target: newsletterSubscribers.email, set: { unsubscribedAt: sql`NULL` } });
      res.status(201).json({ success: true, data: { subscribed: true } });
    } catch (e) {
      next(e);
    }
  },
);

export default router;
