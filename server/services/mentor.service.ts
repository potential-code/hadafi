import { eq, and, isNull } from "drizzle-orm";

import { db } from "../db";
import { mentorSetupTokens, mentorRegistrations } from "../db/schema";
import { AppError } from "../utils/app-error";

// ---------------------------------------------------------------------------
// Shared token lookup helper
// ---------------------------------------------------------------------------

interface TokenWithRegistration {
  token: typeof mentorSetupTokens.$inferSelect;
  registration: typeof mentorRegistrations.$inferSelect;
}

export async function findValidToken(tokenValue: string): Promise<TokenWithRegistration> {
  const rows = await db
    .select({
      tokenId: mentorSetupTokens.id,
      token: mentorSetupTokens.token,
      expiresAt: mentorSetupTokens.expiresAt,
      usedAt: mentorSetupTokens.usedAt,
      mentorRegistrationId: mentorSetupTokens.mentorRegistrationId,
      mentorId: mentorRegistrations.id,
      mentorName: mentorRegistrations.name,
      mentorEmail: mentorRegistrations.email,
      mentorStatus: mentorRegistrations.status,
      mentorUserId: mentorRegistrations.userId,
    })
    .from(mentorSetupTokens)
    .innerJoin(
      mentorRegistrations,
      eq(mentorSetupTokens.mentorRegistrationId, mentorRegistrations.id),
    )
    .where(eq(mentorSetupTokens.token, tokenValue))
    .limit(1);

  const row = rows[0];

  if (!row) {
    throw new AppError("Setup link is invalid", 404, "TOKEN_NOT_FOUND");
  }

  if (row.usedAt !== null || row.expiresAt < new Date()) {
    throw new AppError("This setup link has expired or already been used", 400, "TOKEN_EXPIRED");
  }

  return {
    token: {
      id: row.tokenId,
      token: row.token,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      mentorRegistrationId: row.mentorRegistrationId,
      createdAt: new Date(), // not selected — not needed downstream
    },
    registration: {
      id: row.mentorId,
      name: row.mentorName,
      email: row.mentorEmail,
      status: row.mentorStatus,
      userId: row.mentorUserId,
      linkedinUrl: null,
      hourlyRate: null,
      expertise: null,
      methods: null,
      passion: null,
      createdAt: new Date(), // not selected — not needed downstream
    },
  };
}

// ---------------------------------------------------------------------------
// validateSetupToken  (GET /api/mentor/setup-token)
// ---------------------------------------------------------------------------

export interface SetupTokenInfo {
  name: string;
  email: string;
}

/**
 * Validates a mentor setup token and returns the pre-filled name + email.
 *
 * @throws AppError(404, "TOKEN_NOT_FOUND")  — token does not exist
 * @throws AppError(400, "TOKEN_EXPIRED")    — token already used or past expiry
 */
export async function validateSetupToken(token: string): Promise<SetupTokenInfo> {
  const { registration } = await findValidToken(token);
  return { name: registration.name, email: registration.email };
}

// Completing the setup (creating the mentor account and signing in) is
// POST /api/auth/hadafi/mentor-setup: server/auth/hadafiPlugin.ts.
