import { Router, type IRouter } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";

import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as authController from "../controllers/auth.controller";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Strict limiter applied to credential-accepting endpoints (register, login).
 * 20 requests per 15-minute window is generous for legitimate users but
 * significantly slows brute-force and credential-stuffing attacks.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,  // Return RateLimit-* headers per RFC 6585
  legacyHeaders: false,   // Disable X-RateLimit-* headers
  message: {
    success: false,
    error: {
      message: "Too many requests, please try again later.",
      code: "RATE_LIMITED",
    },
  },
});

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/**
 * Registration body schema.
 * - fullName: trimmed, must be non-empty
 * - email: normalised to lowercase for consistent storage and lookup
 * - password: 8–128 chars (min prevents weak passwords; max prevents DoS via bcrypt)
 * - country: trimmed, must be non-empty
 * - couponCode: optional invite code, max 100 chars
 */
const registerDto = z.object({
  fullName: z.string().min(1).max(200).trim(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  country: z.string().min(1).max(100),
  couponCode: z.string().max(100).optional(),
});

/**
 * Login body schema.
 * - email normalised to lowercase to match stored value
 * - password max-bounded to prevent DoS via oversized bcrypt input
 */
const loginDto = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

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

/**
 * Change-password body schema.
 * newPassword max-bounded to prevent DoS via oversized bcrypt input.
 */
const changePasswordDto = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Auth routes — mounted at /api/auth in routes/index.ts
 *
 * POST   /api/auth/register        — create account + receive JWT
 * POST   /api/auth/login           — exchange credentials for JWT
 * GET    /api/auth/me              — fetch own profile (requires valid JWT)
 * PUT    /api/auth/me              — update own profile fields (requires valid JWT)
 * POST   /api/auth/change-password — change own password (requires valid JWT)
 * POST   /api/auth/logout          — stateless; client clears token
 * GET    /api/auth/check-email     — check whether an email is available (no auth required)
 * GET    /api/auth/check-coupon    — advisory coupon pre-validation (no auth required)
 */

router.post("/register", authLimiter, validate(registerDto), authController.register);
router.post("/login", authLimiter, validate(loginDto), authController.login);
router.get("/me", authenticate, authController.me);
// Short-lived service JWT for the AI backend (chat + voice) — logged-in users only.
router.get("/copilot-token", authenticate, authController.copilotToken);
// Anonymous variant for the public landing-page chat (rate-limited, 30 min).
router.get("/copilot-token/guest", authLimiter, authController.guestCopilotToken);
router.put("/me", authenticate, validate(updateProfileDto), authController.updateProfile);
router.post("/change-password", authenticate, validate(changePasswordDto), authController.changePassword);
router.post("/logout", authController.logout);

// Query-param validation is performed inside the controller because the shared
// `validate` middleware only targets req.body. authLimiter is applied to
// discourage bulk scraping / enumeration at rate-limit granularity.
router.get("/check-email", authLimiter, authController.checkEmail);

// Advisory coupon pre-validation. Uses the same authLimiter to prevent bulk
// coupon enumeration. Always returns HTTP 200; valid:false means invalid code.
router.get("/check-coupon", authLimiter, authController.checkCoupon);

export default router;
