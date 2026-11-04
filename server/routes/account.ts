import { Router, type IRouter } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";

import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as accountController from "../controllers/account.controller";

const router: IRouter = Router();

// Signing in and up, sessions, sign-out, password change and reset are Better
// Auth's (/api/auth/*, server/auth), with their own per-IP and per-email
// limits. These are the account routes around them.

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * The public sign-up checks (is this email registered? is this invite code
 * active?). 20 per 15 minutes slows bulk enumeration without getting in the
 * way of someone filling in the form.
 */
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many requests, please try again later.", code: "RATE_LIMITED" } },
});

/**
 * Guest chat tokens for the public sign-up chat. Separate from sign-in, so a
 * room of visitors chatting doesn't use up the sign-in budget. The AI service
 * applies its own per-visitor limits on top.
 */
const guestTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many requests, please try again later.", code: "RATE_LIMITED" } },
});

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/** Normalise URL-ish fields: null and "" both become null; valid URLs pass through. */
const optionalProfileUrl = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().url("Must be a valid URL").max(500).optional(),
).transform((v) => v ?? null);

/**
 * Update-profile body schema.
 * All fields are optional — only supplied fields are persisted.
 * linkedinUrl and meetingLink are only written for the relevant role users.
 */
const updateProfileDto = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(200).trim().optional(),
  phone: z.string().max(30).nullable().optional(),
  bio: z.string().max(500, "Bio must be under 500 characters").nullable().optional(),
  company: z.string().max(200).trim().nullable().optional(),
  country: z.string().max(100).trim().nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  linkedinUrl: optionalProfileUrl.optional(),
  meetingLink: optionalProfileUrl.optional(),
});

/** First password for an account that has none (max-bounded: bcrypt cost). */
const setPasswordDto = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  confirm: z.string().min(8).max(128),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Account routes — mounted at /api/account in routes/index.ts
 *
 * GET  /me                    — own profile
 * PUT  /me                    — update own profile fields
 * POST /set-password          — first password for an account created without one
 * GET  /copilot-token         — 1-hour service JWT for Hana (chat, TTS)
 * GET  /copilot-token/guest   — 30-minute anonymous token for the sign-up chat
 * GET  /voice-token           — 60-second token for the voice WebSocket URL
 * POST /check-email { email } — is this email free to sign up with (in the body, so it stays out of URLs and logs)
 * GET  /check-coupon?code=    — is this invite code active (advisory)
 */
router.get("/me", authenticate, accountController.me);
router.put("/me", authenticate, validate(updateProfileDto), accountController.updateProfile);
router.post("/set-password", authenticate, validate(setPasswordDto), accountController.setPassword);
// Short-lived service JWT for the AI backend (chat + voice) — signed-in users only.
router.get("/copilot-token", authenticate, accountController.copilotToken);
// Anonymous variant for the public landing-page chat (rate-limited, 30 min).
router.get("/copilot-token/guest", guestTokenLimiter, accountController.guestCopilotToken);
router.get("/voice-token", authenticate, accountController.voiceToken);
router.post("/check-email", lookupLimiter, accountController.checkEmail);
// Advisory coupon pre-validation. Always returns HTTP 200; valid:false means invalid code.
router.get("/check-coupon", lookupLimiter, accountController.checkCoupon);

export default router;
