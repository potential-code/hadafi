import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";

import { db } from "../db";
import { authAccounts, authRateLimits, authSessions, authVerifications, users } from "../db/schema";
import { sendCodeEmail } from "./emails";
import { createAuthMiddleware } from "better-auth/api";
import { enforceEmailBudget } from "./emailLimits";
import { verifyLegacyAccount } from "./legacyVerification";
import { hashPassword, verifyPassword } from "./password";
import { hadafiPlugin } from "./hadafiPlugin";

// Sessions, sign-in and sign-up for learners, mentors and admins (Hadafi).
//
// The browser reaches this server through the Next app's /api rewrite, so the
// session cookie belongs to the site's own domain (first-party, httpOnly).
// BETTER_AUTH_URL is therefore the public site URL, not this server's URL.

// `||`, not `??`: docker-compose passes unset variables as empty strings.
const siteUrl = process.env["BETTER_AUTH_URL"] || process.env["FRONTEND_URL"] || "http://localhost:3000";
const isProduction = process.env["NODE_ENV"] === "production";

// Requests arrive through the edge proxy and then the Next server, each of
// which appends to X-Forwarded-For. Hops in these ranges are skipped when
// finding the client IP for rate limiting. Only safe while this server is not
// reachable from the internet except through those proxies. The default
// matches the Express "trust proxy" setting in index.ts (loopback,
// link-local and private ranges).
const trustedProxies = (process.env["TRUSTED_PROXIES"] || "127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,fc00::/7,fe80::/10")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DAY = 60 * 60 * 24;

export const auth = betterAuth({
  appName: "Hadafi",
  baseURL: siteUrl,
  basePath: "/api/auth",
  // An empty BETTER_AUTH_SECRET (compose default) must fall back too, or
  // Better Auth would use its public default secret.
  secret: process.env["BETTER_AUTH_SECRET"] || process.env["JWT_SECRET"],
  trustedOrigins: [siteUrl],
  telemetry: { enabled: false },
  // Built-in endpoints Hadafi doesn't use. Profile edits go through
  // PUT /api/account/me (validated), resets and verification through email
  // codes, so these would only be ways around those rules.
  disabledPaths: [
    "/update-user",
    "/change-email",
    "/delete-user",
    "/request-password-reset",
    "/reset-password",
    "/verify-email",
    "/send-verification-email",
    "/link-social",
    "/unlink-account",
    // Email change by code: Hadafi never sends those codes, so leave no way in.
    "/email-otp/request-email-change",
    "/email-otp/change-email",
  ],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      users,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
      rateLimit: authRateLimits,
    },
  }),

  user: {
    modelName: "users",
    fields: { name: "fullName", image: "avatarUrl" },
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "sme", input: false },
      country: { type: "string", required: false, input: false },
      legacyAccount: { type: "boolean", required: false, defaultValue: false, input: false, returned: false },
    },
  },

  session: {
    expiresIn: 7 * DAY,
    updateAge: DAY,
    // Session checks read a signed cookie for up to 5 minutes before going
    // back to the database, so a revoked session can linger that long.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  emailAndPassword: {
    enabled: true,
    // Accounts are created by the Hadafi endpoints (auth/hadafiPlugin.ts) after
    // the email is proven, never by Better Auth's open sign-up.
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: { hash: hashPassword, verify: verifyPassword },
    revokeSessionsOnPasswordReset: true,
  },

  emailVerification: {
    // A legacy account signing in with its password gets a code to verify
    // its email, then is signed in by entering it.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: "hashed",
      // Sign-in codes go only to existing accounts; sign-up has its own flow.
      disableSignUp: true,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "change-email") return;
        await sendCodeEmail(email, otp, type);
      },
    }),
    hadafiPlugin(),
  ],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Per-email limits first (auth/emailLimits.ts), so a spent budget stops
      // the request before any code is sent or checked.
      await enforceEmailBudget(ctx);
      await verifyLegacyAccount(ctx);
    }),
  },

  rateLimit: {
    enabled: process.env["NODE_ENV"] !== "test",
    storage: "database",
    window: 60,
    // Generous default: a whole office can share one public IP.
    max: 300,
    customRules: {
      // Every page asks for the session; it only reads the caller's own.
      "/get-session": false,
      // Per network address, per minute. Hadafi runs sign-up sessions in rooms
      // where everyone shares one Wi-Fi address, so these allow a full room at
      // once. Guessing is stopped per email whatever the address
      // (emailLimits.ts: 5 codes sent, 10 code tries, 20 passwords an hour).
      "/sign-in/email": { window: 60, max: 40 },
      "/sign-in/email-otp": { window: 60, max: 40 },
      "/email-otp/send-verification-otp": { window: 60, max: 30 },
      "/email-otp/request-password-reset": { window: 60, max: 15 },
      "/email-otp/verify-email": { window: 60, max: 40 },
      "/email-otp/reset-password": { window: 60, max: 20 },
      "/hadafi/sign-up/send-code": { window: 60, max: 30 },
      "/hadafi/sign-up/verify-code": { window: 60, max: 60 },
      "/hadafi/sign-up": { window: 60, max: 30 },
      "/hadafi/mentor-setup": { window: 60, max: 10 },
    },
  },

  advanced: {
    cookiePrefix: "hadafi",
    useSecureCookies: isProduction,
    database: { generateId: "uuid" },
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
