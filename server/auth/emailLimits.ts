import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "../db";

// Per-email limits for everything that sends a code or checks a code or
// password. Better Auth's own limits count per IP, so an attacker spreading
// guesses (or code requests) over many IPs was not slowed down at all. These
// count per address, whatever the IP, across every route that touches it:
// asking for a new code no longer resets anything that matters.
//
// Counters live in auth_rate_limits next to Better Auth's own (keys prefixed
// "hadafi-email:"), with the address hashed so the table holds no emails.

const HOUR = 60 * 60 * 1000;

type Budget = { name: string; max: number; windowMs: number; message: string };

const SEND: Budget = { name: "send", max: 5, windowMs: HOUR, message: "Too many codes sent to this email. Try again in an hour." };
const CODE: Budget = { name: "code", max: 10, windowMs: HOUR, message: "Too many code attempts for this email. Try again in an hour." };
const PASSWORD: Budget = { name: "password", max: 20, windowMs: HOUR, message: "Too many sign-in attempts for this email. Try again in an hour, or sign in with an email code." };

/** Which budget each auth route spends, keyed by Better Auth path. */
export const EMAIL_BUDGETS: Record<string, Budget> = {
  "/email-otp/send-verification-otp": SEND,
  "/email-otp/request-password-reset": SEND,
  "/forget-password/email-otp": SEND,
  "/hadafi/sign-up/send-code": SEND,
  "/sign-in/email-otp": CODE,
  "/email-otp/verify-email": CODE,
  "/email-otp/reset-password": CODE,
  "/email-otp/check-verification-otp": CODE,
  "/hadafi/sign-up/verify-code": CODE,
  "/sign-in/email": PASSWORD,
};

// Off in the test suite (which signs in many times from one process) unless a
// test switches it on to check it.
const enabled = () => process.env["NODE_ENV"] !== "test" || process.env["HADAFI_EMAIL_LIMITS"] === "on";

const keyFor = (budget: Budget, email: string) =>
  `hadafi-email:${budget.name}:${crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("base64url")}`;

/**
 * Counts one use of `budget` for `email` and throws 429 once it is spent.
 * Fixed window: last_request holds when the window started.
 */
export async function spendEmailBudget(budget: Budget, email: string): Promise<void> {
  if (!enabled() || !email) return;
  const now = Date.now();
  const expired = now - budget.windowMs;
  const result = await db.execute(sql`
    insert into auth_rate_limits (id, key, count, last_request)
    values (gen_random_uuid(), ${keyFor(budget, email)}, 1, ${now})
    on conflict (key) do update set
      count = case when auth_rate_limits.last_request <= ${expired} then 1 else auth_rate_limits.count + 1 end,
      last_request = case when auth_rate_limits.last_request <= ${expired} then ${now} else auth_rate_limits.last_request end
    returning count, last_request
  `);
  const row = result.rows[0] as { count: number; last_request: string | number } | undefined;
  if (row && row.count > budget.max) {
    const retryAfter = Math.max(1, Math.ceil((Number(row.last_request) + budget.windowMs - now) / 1000));
    throw new APIError("TOO_MANY_REQUESTS", { message: budget.message, code: "EMAIL_RATE_LIMITED" }, { "X-Retry-After": String(retryAfter) });
  }
}

/** Before-hook body: spends the budget of the route being called, if it has one. */
export async function enforceEmailBudget(ctx: { path?: string; body?: unknown }): Promise<void> {
  const budget = ctx.path ? EMAIL_BUDGETS[ctx.path] : undefined;
  if (!budget) return;
  const email = (ctx.body as { email?: unknown } | undefined)?.email;
  if (typeof email === "string") await spendEmailBudget(budget, email);
}
