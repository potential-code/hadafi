import { and, eq, sql } from "drizzle-orm";

import { db } from "../db";
import {
  users,
  authAccounts,
  inviteCodes,
  courseCertificates,
  courseEnrollments,
  mentorRegistrations,
} from "../db/schema";
import { AppError } from "../utils/app-error";

// Profile and pre-sign-up checks for /api/account. Signing in, signing up,
// sessions and passwords are Better Auth's (server/auth).

/**
 * Public user shape returned by auth endpoints — never includes passwordHash.
 */
export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  country: string | null;
}

/**
 * Extended user shape returned by /me — includes profile fields.
 */
export interface MeUser extends PublicUser {
  bio: string | null;
  company: string | null;
  phone: string | null;
  avatarUrl: string | null;
  certificatesCount: number;
  coursesCount: number;
  linkedinUrl: string | null;
  timezone: string | null;      // IANA timezone string (e.g. "America/New_York")
  meetingLink: string | null;   // Video call URL set by mentor users
  createdAt: Date;
  hasPassword: boolean; // true once the account has a password; false for code-only accounts
}

// ---------------------------------------------------------------------------
// checkEmailAvailability
// ---------------------------------------------------------------------------

/**
 * Checks whether an email address is available for registration.
 *
 * Performs a lightweight existence check against the users table. Returns
 * `{ available: true }` when no matching row is found, `{ available: false }`
 * when the email is already registered.
 *
 * NOTE: Intentionally never throws — callers should always receive a 200
 * response; the `available` flag carries the result. Only an unexpected DB
 * error should propagate up (and will be caught by the error handler).
 *
 * @param email - The email address to check (should already be normalised to lowercase)
 * @returns Object indicating whether the email is available
 */
export async function checkEmailAvailability(
  email: string,
): Promise<{ available: boolean }> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return { available: existing.length === 0 };
}

// ---------------------------------------------------------------------------
// checkCouponValidity
// ---------------------------------------------------------------------------

/**
 * Returns whether the given coupon code is currently active.
 * Non-mutating SELECT — does NOT lock the row. The registration transaction
 * performs its own atomic FOR UPDATE check; this is advisory only.
 */
export async function checkCouponValidity(
  code: string,
): Promise<{ valid: boolean }> {
  const result = await db
    .select({ id: inviteCodes.id })
    .from(inviteCodes)
    .where(and(eq(inviteCodes.code, code), eq(inviteCodes.status, "active")))
    .limit(1);

  return { valid: result.length > 0 };
}

// ---------------------------------------------------------------------------
// getMe
// ---------------------------------------------------------------------------

/**
 * Returns the full profile for an authenticated user.
 * Selects only the columns needed for the profile — passwordHash is excluded.
 *
 * @param userId - UUID of the signed-in user
 * @throws AppError(404, "USER_NOT_FOUND") — if the user row no longer exists
 */
export async function getMe(userId: string): Promise<MeUser> {
  const found = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      country: users.country,
      bio: users.bio,
      company: users.company,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      meetingLink: users.meetingLink,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = found[0];
  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  const [credential] = await db
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, "credential")))
    .limit(1);

  const [certRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(courseCertificates)
    .where(eq(courseCertificates.userId, userId));

  const [enrollRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(courseEnrollments)
    .where(eq(courseEnrollments.userId, userId));

  let linkedinUrl: string | null = null;
  if (user.role === "mentor") {
    const [reg] = await db
      .select({ linkedinUrl: mentorRegistrations.linkedinUrl })
      .from(mentorRegistrations)
      .where(eq(mentorRegistrations.userId, userId))
      .limit(1);
    linkedinUrl = reg?.linkedinUrl ?? null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    country: user.country ?? null,
    bio: user.bio ?? null,
    company: user.company ?? null,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    certificatesCount: certRow?.n ?? 0,
    coursesCount: enrollRow?.n ?? 0,
    linkedinUrl,
    timezone: user.timezone ?? null,
    meetingLink: user.meetingLink ?? null,
    createdAt: user.createdAt,
    // Whether the account can sign in with a password (a credential account exists).
    hasPassword: Boolean(credential?.id),
  };
}

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------

/**
 * Updates profile fields for the authenticated user.
 * Only fields present in `data` are written; omitted fields are left unchanged.
 * `linkedinUrl` is only written when `userRole === "mentor"` — silently ignored otherwise.
 *
 * @param userId   - UUID of the user to update
 * @param userRole - Role of the signed-in user (avoids a redundant DB query)
 * @param data     - Partial profile fields to update
 * @throws AppError(404, "USER_NOT_FOUND") — if the user row no longer exists (surfaced via getMe)
 */
export async function updateProfile(
  userId: string,
  userRole: string,
  data: {
    fullName?: string;
    phone?: string | null;
    bio?: string | null;
    company?: string | null;
    country?: string | null;
    linkedinUrl?: string | null;
    timezone?: string | null;
    meetingLink?: string | null;
  },
): Promise<MeUser> {
  const { linkedinUrl, ...userFields } = data;

  type UserUpdate = Partial<Pick<typeof users.$inferInsert, "fullName" | "phone" | "bio" | "company" | "country" | "timezone" | "meetingLink" | "updatedAt">>;
  const userUpdates: UserUpdate = {};
  if (userFields.fullName !== undefined) userUpdates.fullName = userFields.fullName;
  if ("phone" in userFields) userUpdates.phone = userFields.phone ?? null;
  if ("bio" in userFields) userUpdates.bio = userFields.bio ?? null;
  if ("company" in userFields) userUpdates.company = userFields.company ?? null;
  if ("country" in userFields) userUpdates.country = userFields.country ?? null;
  if ("timezone" in userFields && userFields.timezone !== undefined) userUpdates.timezone = userFields.timezone ?? null;
  if ("meetingLink" in userFields && userFields.meetingLink !== undefined) userUpdates.meetingLink = userFields.meetingLink ?? null;

  if (Object.keys(userUpdates).length > 0) {
    userUpdates.updatedAt = new Date();
    await db.update(users).set(userUpdates).where(eq(users.id, userId));
  }

  if (linkedinUrl !== undefined && userRole === "mentor") {
    await db
      .update(mentorRegistrations)
      .set({ linkedinUrl: linkedinUrl ?? null })
      .where(eq(mentorRegistrations.userId, userId));
  }

  return getMe(userId);
}
