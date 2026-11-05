import crypto from "node:crypto";
import { createAuthMiddleware } from "better-auth/api";

// Accounts created before Better Auth (users.legacy_account) start unverified
// and verify on their next sign-in. Signing in with an email code proves the
// address, but Better Auth's code sign-in treats an unverified account as
// possibly pre-registered by someone else and deletes its password and
// sessions. For legacy accounts that would silently wipe a password the owner
// set themselves, so this hook checks the code first and, only when it is
// right, marks the account verified before Better Auth signs it in.

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("base64url");

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

export async function verifyLegacyAccount(ctx: HookContext): Promise<void> {
  if (ctx.path !== "/sign-in/email-otp") return;
  const email = typeof ctx.body?.email === "string" ? ctx.body.email.toLowerCase() : "";
  const otp = typeof ctx.body?.otp === "string" ? ctx.body.otp : "";
  if (!email || !otp) return;

  const found = await ctx.context.internalAdapter.findUserByEmail(email);
  const user = found?.user as { id: string; emailVerified: boolean; legacyAccount?: boolean } | undefined;
  if (!user || user.emailVerified || !user.legacyAccount) return;

  // Same identifier and hashing as Better Auth's email-otp plugin (storeOTP: "hashed").
  const row = await ctx.context.internalAdapter.findVerificationValue(`sign-in-otp-${email}`);
  if (!row || row.expiresAt < new Date()) return;
  const stored = row.value.slice(0, row.value.lastIndexOf(":"));
  const given = sha256(otp);
  if (stored.length !== given.length || !crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(given))) return;

  await ctx.context.internalAdapter.updateUser(user.id, { emailVerified: true });
}
