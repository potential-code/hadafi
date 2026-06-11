import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import * as authService from "../services/auth.service";

/**
 * GET /api/auth/copilot-token
 *
 * Mints a short-lived service JWT for the AI backend (potential-ai). The AI
 * service trusts tokens signed with the shared COPILOT_SERVICE_JWT_SECRET and
 * scopes conversations by the platformId/userId claims. Requiring Hadafi auth
 * here is what gates the assistant (chat, voice STT/TTS) to logged-in users —
 * the shared secret never reaches the browser.
 */
export async function copilotToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const secret = process.env["COPILOT_SERVICE_JWT_SECRET"];
    if (!secret) {
      res.status(503).json({
        success: false,
        error: { message: "AI assistant is not configured", code: "COPILOT_NOT_CONFIGURED" },
      });
      return;
    }
    const expiresInSeconds = 60 * 60; // 1 hour; the client refreshes before expiry
    const token = jwt.sign(
      { platformId: "hadafi", userId: req.user!.userId },
      secret,
      { algorithm: "HS256", expiresIn: expiresInSeconds },
    );
    res.status(200).json({
      success: true,
      data: { token, expiresAt: Date.now() + expiresInSeconds * 1000 },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/copilot-token/guest
 *
 * Mints a short-lived ANONYMOUS service JWT (platformId only, no userId) so
 * the public landing-page registration chat works for logged-out visitors.
 * The AI backend stores anonymous conversations under TTL'd threads. Shorter
 * expiry than the user token, and rate-limited at the route to deter abuse.
 */
export async function guestCopilotToken(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const secret = process.env["COPILOT_SERVICE_JWT_SECRET"];
    if (!secret) {
      res.status(503).json({
        success: false,
        error: { message: "AI assistant is not configured", code: "COPILOT_NOT_CONFIGURED" },
      });
      return;
    }
    const expiresInSeconds = 30 * 60; // 30 minutes
    const token = jwt.sign({ platformId: "hadafi" }, secret, {
      algorithm: "HS256",
      expiresIn: expiresInSeconds,
    });
    res.status(200).json({
      success: true,
      data: { token, expiresAt: Date.now() + expiresInSeconds * 1000 },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/register
 *
 * Registers a new SME user. Accepts an optional couponCode for invite-based
 * access. On success, returns 201 with a JWT and the public user object.
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { fullName, email, password, country, couponCode } = req.body as {
      fullName: string;
      email: string;
      password: string;
      country: string;
      couponCode?: string;
    };

    const result = await authService.registerUser({
      fullName,
      email,
      password,
      country,
      couponCode,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 *
 * Authenticates a user by email + password. Returns 200 with a JWT and the
 * public user object on success.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };

    const result = await authService.loginUser({ email, password });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 *
 * Returns the authenticated user's profile. Requires the `authenticate`
 * middleware to have run first — req.user is guaranteed to be set.
 */
export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.user is set by the authenticate middleware; it will always be present
    // on this route because authenticate is applied before this handler.
    const userId = req.user!.userId; // ! safe: authenticate middleware guarantees it
    const user = await authService.getMe(userId);
    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 *
 * Stateless logout — the server has no session to invalidate.
 * The client is responsible for discarding the JWT.
 */
export function logout(_req: Request, res: Response): void {
  res.status(200).json({ success: true, data: { ok: true } });
}

/**
 * PUT /api/auth/me
 *
 * Updates the authenticated user's profile fields. Only the fields present
 * in the request body are updated; omitted fields are left unchanged.
 * For mentor-role users, `linkedinUrl` is written to mentor_registrations.
 */
export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const user = await authService.updateProfile(userId, userRole, req.body as {
      fullName?: string;
      phone?: string | null;
      bio?: string | null;
      company?: string | null;
      country?: string | null;
      timezone?: string | null;
      linkedinUrl?: string | null;
      meetingLink?: string | null;
    });
    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/change-password
 *
 * Changes the authenticated user's password. Verifies the current password
 * before writing the new bcrypt hash.
 */
export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    await authService.changePassword(userId, currentPassword, newPassword);
    res.status(200).json({ success: true, data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

/** Zod schema used to validate the `email` query parameter on GET /check-email. */
const checkEmailQuerySchema = z.object({
  email: z.string().email("Must be a valid email address").toLowerCase(),
});

/** Zod schema used to validate the `code` query parameter on GET /check-coupon. */
const checkCouponQuerySchema = z.object({
  code: z.string().trim().min(1).max(100),
});

/**
 * GET /api/auth/check-email?email=
 *
 * Returns whether the given email address is available for registration.
 * Always responds with HTTP 200 — the `available` boolean in the response
 * body indicates the result. Never throws a 4xx for a taken email.
 *
 * Query params are validated manually here because the shared `validate`
 * middleware targets `req.body` only.
 */
export async function checkEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = checkEmailQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      res.status(422).json({
        success: false,
        error: { message: "Validation failed", code: "VALIDATION_ERROR", errors },
      });
      return;
    }

    const result = await authService.checkEmailAvailability(parsed.data.email);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/check-coupon?code=
 *
 * Advisory coupon pre-validation. Returns whether the given code is currently
 * active. Always responds with HTTP 200 — `valid: false` means invalid, not an
 * error. The registration transaction still performs its own atomic FOR UPDATE
 * check; this endpoint is non-mutating and advisory only.
 *
 * Query params are validated inline because the shared `validate` middleware
 * targets `req.body` only.
 */
export async function checkCoupon(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = checkCouponQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      res.status(422).json({
        success: false,
        error: { message: "Validation failed", code: "VALIDATION_ERROR", errors },
      });
      return;
    }

    const result = await authService.checkCouponValidity(parsed.data.code);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
