import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { authAccounts, inviteCodes, mentorRegistrations, mentorSetupTokens, users } from "../db/schema";
import { findValidToken } from "../services/mentor.service";
import { findJoinable } from "../services/organisations.service";
import { AppError } from "../utils/app-error";
import { hashPassword } from "./password";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A credential account row: how Better Auth stores an email + password login. */
async function insertCredentialAccount(tx: Tx, userId: string, password: string): Promise<void> {
  await tx.insert(authAccounts).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(password),
  });
}

async function assertEmailFree(email: string): Promise<void> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new AppError("An account with this email already exists", 409, "EMAIL_EXISTS");
}

const orgLinkGone = () =>
  new AppError(
    "This organisation link isn't active any more. Ask the organisation for a new one, or sign up without it.",
    400,
    "INVALID_ORG_CODE",
  );

/**
 * The checks sign-up can fail on (email taken, invite code not active,
 * organisation link not active), without changing anything.
 * createLearnerAccount repeats them atomically.
 */
export async function assertCanSignUp(email: string, couponCode?: string, orgCode?: string): Promise<void> {
  await assertEmailFree(email);
  if (orgCode && !(await findJoinable(orgCode))) throw orgLinkGone();
  if (couponCode) {
    const [code] = await db
      .select({ status: inviteCodes.status })
      .from(inviteCodes)
      .where(eq(inviteCodes.code, couponCode))
      .limit(1);
    if (!code || code.status !== "active") {
      throw new AppError("Invalid or already used coupon code", 400, "INVALID_COUPON");
    }
  }
}

/**
 * Creates a learner whose email was already proven with a sign-up code.
 * The password is optional: Hana's chat sign-up creates the account without
 * one and the learner can add one later from Profile.
 *
 * @throws AppError(409, "EMAIL_EXISTS") | AppError(400, "INVALID_COUPON") | AppError(400, "INVALID_ORG_CODE")
 */
export async function createLearnerAccount(data: {
  fullName: string;
  email: string;
  country: string;
  couponCode?: string | undefined;
  password?: string | undefined;
  /** An organisation's sign-up code: the learner joins that organisation (never sets a role). */
  orgCode?: string | undefined;
}): Promise<string> {
  await assertEmailFree(data.email);
  const organisation = data.orgCode ? await findJoinable(data.orgCode) : null;
  if (data.orgCode && !organisation) throw orgLinkGone();

  return db.transaction(async (tx) => {
    // Lock the invite code row so two sign-ups cannot both redeem it.
    let inviteCodeId: string | null = null;
    if (data.couponCode) {
      const locked = await tx.execute(sql`SELECT * FROM invite_codes WHERE code = ${data.couponCode} FOR UPDATE`);
      const row = locked.rows[0] as typeof inviteCodes.$inferSelect | undefined;
      if (!row || row.status !== "active") {
        throw new AppError("Invalid or already used coupon code", 400, "INVALID_COUPON");
      }
      inviteCodeId = row.id;
    }

    const [user] = await tx
      .insert(users)
      .values({
        fullName: data.fullName,
        email: data.email,
        emailVerified: true,
        role: "sme",
        country: data.country,
        inviteCodeId,
        organisationId: organisation?.id ?? null,
      })
      .returning({ id: users.id });
    if (!user) throw new AppError("Failed to create user", 500, "INSERT_FAILED");

    if (data.password) await insertCredentialAccount(tx, user.id, data.password);

    if (inviteCodeId) {
      await tx
        .update(inviteCodes)
        .set({ usedBy: user.id, usedAt: new Date(), status: "used" })
        .where(eq(inviteCodes.id, inviteCodeId));
    }
    return user.id;
  });
}

/**
 * Creates a mentor from an approved application's setup link. The link was
 * emailed to the applicant, so following it proves the address.
 *
 * @throws AppError(404, "TOKEN_NOT_FOUND") | AppError(400, "TOKEN_EXPIRED") | AppError(409, "EMAIL_EXISTS")
 */
export async function createMentorAccount(data: { token: string; password: string }): Promise<string> {
  const { token, registration } = await findValidToken(data.token);
  await assertEmailFree(registration.email);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ fullName: registration.name, email: registration.email, emailVerified: true, role: "mentor" })
      .returning({ id: users.id });
    if (!user) throw new AppError("Failed to create mentor account", 500, "INSERT_FAILED");

    await insertCredentialAccount(tx, user.id, data.password);
    await tx.update(mentorRegistrations).set({ userId: user.id }).where(eq(mentorRegistrations.id, registration.id));
    await tx.update(mentorSetupTokens).set({ usedAt: new Date() }).where(eq(mentorSetupTokens.id, token.id));
    return user.id;
  });
}
