import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, and, isNull } from "drizzle-orm";

import { db } from "../db";
import { mentorSetupTokens, mentorRegistrations, users } from "../db/schema";
import { AppError } from "../utils/app-error";

const BCRYPT_ROUNDS = 12;
const TOKEN_EXPIRY = "12h";

interface JwtPayload {
  userId: string;
  role: string;
}

function signToken(userId: string, role: string): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new AppError("JWT_SECRET is not configured", 500, "SERVER_MISCONFIGURATION");
  }
  const payload: JwtPayload = { userId, role };
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: TOKEN_EXPIRY });
}

// ---------------------------------------------------------------------------
// Shared token lookup helper
// ---------------------------------------------------------------------------

interface TokenWithRegistration {
  token: typeof mentorSetupTokens.$inferSelect;
  registration: typeof mentorRegistrations.$inferSelect;
}

async function findValidToken(tokenValue: string): Promise<TokenWithRegistration> {
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

// ---------------------------------------------------------------------------
// completeMentorSetup  (POST /api/mentor/setup)
// ---------------------------------------------------------------------------

export interface SetupResult {
  token: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
}

/**
 * Creates a mentor account from a valid setup token.
 *
 * Steps (all inside a transaction):
 * 1. Validate the token (not expired, not used).
 * 2. Check no user account already exists for this email.
 * 3. Hash the password and insert the user row with role='mentor'.
 * 4. Link the user back to the mentor_registrations row.
 * 5. Mark the setup token as used.
 *
 * Returns a signed JWT so the mentor is immediately logged in.
 *
 * @throws AppError(404, "TOKEN_NOT_FOUND")  — token does not exist
 * @throws AppError(400, "TOKEN_EXPIRED")    — token used or past expiry
 * @throws AppError(409, "EMAIL_EXISTS")     — account for this email already exists
 */
export async function completeMentorSetup(data: {
  token: string;
  password: string;
}): Promise<SetupResult> {
  const { token: tokenValue, password } = data;

  const { token: tokenRow, registration } = await findValidToken(tokenValue);

  // Guard: if an account was somehow already created for this email, reject.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, registration.email))
    .limit(1);

  if (existing.length > 0) {
    throw new AppError("An account for this email already exists", 409, "EMAIL_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const newUser = await db.transaction(async (tx) => {
    // Insert the mentor user account.
    const [inserted] = await tx
      .insert(users)
      .values({
        fullName: registration.name,
        email: registration.email,
        passwordHash,
        role: "mentor",
      })
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
      });

    if (!inserted) {
      throw new AppError("Failed to create mentor account", 500, "INSERT_FAILED");
    }

    // Link the mentor_registrations row to the new user.
    await tx
      .update(mentorRegistrations)
      .set({ userId: inserted.id })
      .where(eq(mentorRegistrations.id, registration.id));

    // Consume the setup token.
    await tx
      .update(mentorSetupTokens)
      .set({ usedAt: new Date() })
      .where(eq(mentorSetupTokens.id, tokenRow.id));

    return inserted;
  });

  const jwtToken = signToken(newUser.id, newUser.role);

  return {
    token: jwtToken,
    user: {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      role: newUser.role,
    },
  };
}
