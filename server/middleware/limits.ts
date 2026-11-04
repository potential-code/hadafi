import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit'
import type { Request } from 'express'

export const MINUTE = 60 * 1000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

const tooMany = (message: string) => ({
  success: false,
  error: { message, code: 'RATE_LIMITED' },
})

/**
 * Limits one signed-in user (falls back to the visitor's address). Mount after
 * `authenticate`. Counts live in memory: Hadafi runs a single API container,
 * and a restart only resets the counters.
 */
export function perUser(
  name: string,
  windowMs: number,
  max: number,
  message = 'You are doing that too often. Please try again later.',
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req: Request) => `${name}:${req.user?.userId ?? ipKeyGenerator(req.ip ?? '')}`,
    message: tooMany(message),
  })
}

// Per-email limits on sign-in codes and passwords are counted in the database
// by Better Auth hooks (server/auth/emailLimits.ts), not here.
