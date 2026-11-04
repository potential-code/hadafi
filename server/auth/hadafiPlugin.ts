import crypto from "node:crypto";
import { z } from "zod";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq } from "drizzle-orm";

import { db } from "../db";
import { authVerifications } from "../db/schema";
import { AppError } from "../utils/app-error";
import { assertCanSignUp, createLearnerAccount, createMentorAccount } from "./accounts";
import { sendCodeEmail } from "./emails";

// Hadafi's own sign-up endpoints. A new account is only ever created after the
// email is proven, so there are no unverified new accounts: Hana's chat and
// the sign-up form both send a code first, swap it for a short-lived
// verifiedToken, then create the account and sign in.

const CODE_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const codeId = (email: string) => `hadafi-sign-up-code-${email}`;
const verifiedId = (email: string) => `hadafi-sign-up-verified-${email}`;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("base64url");

function sameHash(a: string, b: string): boolean {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** AppErrors from the account services become Better Auth API errors with the same code. */
function toApiError(err: unknown): never {
  if (err instanceof AppError) {
    const status = err.statusCode === 409 ? "CONFLICT" : err.statusCode === 404 ? "NOT_FOUND" : "BAD_REQUEST";
    throw APIError.fromStatus(status, { message: err.message, code: err.code });
  }
  throw err;
}

const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().min(8).max(128);

export const hadafiPlugin = () =>
  ({
    id: "hadafi",
    endpoints: {
      sendSignUpCode: createAuthEndpoint(
        "/hadafi/sign-up/send-code",
        { method: "POST", body: z.object({ email }) },
        async (ctx) => {
          const address = ctx.body.email;
          // Existing accounts get no code (the form already says the email is
          // taken); answering the same way either way keeps this endpoint quiet.
          if (!(await ctx.context.internalAdapter.findUserByEmail(address))) {
            const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(codeId(address));
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: codeId(address),
              value: `${sha256(code)}:0`,
              expiresAt: new Date(Date.now() + CODE_TTL_MS),
            });
            await sendCodeEmail(address, code, "sign-up");
          }
          return ctx.json({ ok: true });
        },
      ),

      verifySignUpCode: createAuthEndpoint(
        "/hadafi/sign-up/verify-code",
        { method: "POST", body: z.object({ email, code: z.string().regex(/^\d{6}$/) }) },
        async (ctx) => {
          const address = ctx.body.email;
          const row = await ctx.context.internalAdapter.findVerificationValue(codeId(address));
          if (!row || row.expiresAt < new Date()) {
            throw APIError.fromStatus("BAD_REQUEST", { message: "This code has expired. Ask for a new one.", code: "OTP_EXPIRED" });
          }
          const split = row.value.lastIndexOf(":");
          const stored = row.value.slice(0, split);
          const attempts = Number(row.value.slice(split + 1)) || 0;
          if (attempts >= MAX_ATTEMPTS) {
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(codeId(address));
            throw APIError.fromStatus("TOO_MANY_REQUESTS", { message: "Too many tries. Ask for a new code.", code: "OTP_LOCKED" });
          }
          // Count this try before checking it, and only if nobody else counted
          // one in between: parallel guesses can't all read 0 tries.
          const counted = await db
            .update(authVerifications)
            .set({ value: `${stored}:${attempts + 1}`, updatedAt: new Date() })
            .where(and(eq(authVerifications.identifier, codeId(address)), eq(authVerifications.value, row.value)))
            .returning({ id: authVerifications.id });
          if (!counted.length || !sameHash(stored, sha256(ctx.body.code))) {
            throw APIError.fromStatus("BAD_REQUEST", { message: "That code is not right.", code: "INVALID_OTP" });
          }
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(codeId(address));

          const verifiedToken = crypto.randomBytes(32).toString("base64url");
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(verifiedId(address));
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: verifiedId(address),
            value: sha256(verifiedToken),
            expiresAt: new Date(Date.now() + VERIFIED_TTL_MS),
          });
          return ctx.json({ verified: true, verifiedToken });
        },
      ),

      signUp: createAuthEndpoint(
        "/hadafi/sign-up",
        {
          method: "POST",
          body: z.object({
            fullName: z.string().trim().min(1).max(200),
            email,
            country: z.string().trim().min(1).max(100),
            couponCode: z.string().trim().max(100).optional(),
            password: password.optional(),
            verifiedToken: z.string().min(1),
            rememberMe: z.boolean().optional(),
          }),
        },
        async (ctx) => {
          const { verifiedToken, rememberMe, ...account } = ctx.body;
          // Compare before consuming, so a wrong token cannot burn the real one;
          // the atomic consume then makes the right one single-use.
          const notVerified = () =>
            APIError.fromStatus("BAD_REQUEST", { message: "Please confirm your email again.", code: "EMAIL_NOT_VERIFIED" });
          const proof = await ctx.context.internalAdapter.findVerificationValue(verifiedId(account.email));
          if (!proof || proof.expiresAt < new Date() || !sameHash(proof.value, sha256(verifiedToken))) throw notVerified();
          // Check what can fail before spending the token, so a taken email or
          // a used invite code doesn't send the person back to re-verify.
          await assertCanSignUp(account.email, account.couponCode || undefined).catch(toApiError);
          if (!(await ctx.context.internalAdapter.consumeVerificationValue(verifiedId(account.email)))) throw notVerified();
          const userId = await createLearnerAccount({
            ...account,
            couponCode: account.couponCode || undefined,
          }).catch(toApiError);
          return startSession(ctx, userId, rememberMe === false);
        },
      ),

      mentorSetup: createAuthEndpoint(
        "/hadafi/mentor-setup",
        { method: "POST", body: z.object({ token: z.string().min(1), password }) },
        async (ctx) => {
          const userId = await createMentorAccount(ctx.body).catch(toApiError);
          return startSession(ctx, userId, false);
        },
      ),
    },
  }) satisfies BetterAuthPlugin;

type EndpointCtx = Parameters<typeof setSessionCookie>[0];

async function startSession(ctx: EndpointCtx, userId: string, dontRememberMe: boolean) {
  const user = await ctx.context.internalAdapter.findUserById(userId);
  if (!user) throw APIError.fromStatus("INTERNAL_SERVER_ERROR", { message: "Account was not created" });
  const session = await ctx.context.internalAdapter.createSession(user.id, dontRememberMe);
  await setSessionCookie(ctx, { session, user }, dontRememberMe);
  return ctx.json({ user });
}
