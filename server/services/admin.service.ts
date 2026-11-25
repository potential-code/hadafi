import { randomBytes } from "node:crypto";
import { eq, desc, sql } from "drizzle-orm";

import { db } from "../db";
import { inviteCodes, mentorRegistrations, mentorSetupTokens, stakeholderRegistrations, users } from "../db/schema";
import { AppError } from "../utils/app-error";
import { sendMail } from "../mail/mailer";
import { logger } from "../config/logger";

/** Base URL for the frontend, used when constructing invite and setup links. */
const FRONTEND_URL = process.env["FRONTEND_URL"] ?? "http://localhost:3000";

/** How long a mentor setup link works for. */
const SETUP_LINK_TTL_MS = 48 * 60 * 60 * 1000;

/** A setup link is not sent again sooner than this many seconds after the previous one. */
export const SETUP_LINK_RESEND_COOLDOWN_SECONDS = 60;

/** Subject of the email that carries a mentor's setup link (approval and resend). */
const SETUP_EMAIL_SUBJECT = "Your Hadafi Mentor Application Has Been Approved";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generates a random invite code string in the format "HADAFI-XXXXXXXX"
 * where X is an uppercase alphanumeric character.
 *
 * Uses 6 bytes of cryptographic randomness → 48 bits of entropy,
 * which makes collisions negligible at any realistic scale.
 */
function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(6);
  let suffix = "";
  for (const byte of bytes) {
    // Modulo bias is negligible: 256 / 36 ≈ 7.1, so bias per character is <1%.
    suffix += chars[byte % chars.length];
  }
  return `HADAFI-${suffix}`;
}

/**
 * Issues a fresh mentor setup token valid for 48 hours and returns it.
 *
 * mentor_setup_tokens holds ONE row per registration (unique
 * mentor_registration_id), so the row is written or replaced in place: the
 * previous token value stops existing and any link that carried it no longer
 * works. used_at is cleared so the new token can be used.
 */
async function issueSetupToken(tx: Tx, mentorRegistrationId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SETUP_LINK_TTL_MS);

  // created_at is the database's now(), like the column default, so the resend
  // cooldown can compare it with now() in SQL, on one clock.
  await tx
    .insert(mentorSetupTokens)
    .values({ mentorRegistrationId, token, expiresAt })
    .onConflictDoUpdate({
      target: mentorSetupTokens.mentorRegistrationId,
      set: { token, expiresAt, usedAt: null, createdAt: sql`now()` },
    });

  return { token, expiresAt };
}

/**
 * Emails a mentor their setup link ("mentor-approval" template). Sent after the
 * token's transaction has committed, never inside it. A delivery failure is
 * logged, not thrown: the token is already saved and the admin can resend.
 *
 * @returns true when the mail was handed to the mail server.
 */
async function sendSetupLinkEmail(
  mentor: { id: string; name: string; email: string },
  token: string,
): Promise<boolean> {
  try {
    await sendMail({
      to: mentor.email,
      subject: SETUP_EMAIL_SUBJECT,
      template: "mentor-approval",
      context: {
        mentorName: mentor.name,
        setupLink: `${FRONTEND_URL}/mentor/setup?token=${token}`,
      },
    });
    return true;
  } catch (err) {
    logger.error({ err, mentorRegistrationId: mentor.id }, "Mentor setup link email failed");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Return-type interfaces
// ---------------------------------------------------------------------------

/** Shape returned by createInvite and included in listInvites rows. */
export interface InviteResult {
  id: string;
  code: string;
  inviteLink: string;
}

/** Shape of a user who consumed an invite code, as returned in listInvites. */
export interface InviteUsedBy {
  id: string;
  fullName: string | null;
  email: string | null;
  country: string | null;
  createdAt: Date | null;
}

/** Full invite row including the optional consuming user. */
export interface InviteWithUser {
  id: string;
  code: string;
  status: string;
  createdAt: Date;
  inviteLink: string;
  usedBy: InviteUsedBy | null;
}

/** Shape of a mentor application returned to the admin. */
export interface MentorApplication {
  id: string;
  name: string;
  email: string;
  linkedinUrl: string | null;
  hourlyRate: number | null;
  expertise: string[] | null;
  methods: string[] | null;
  passion: string | null;
  status: string;
  /** True once the mentor has created their account from the setup link. */
  hasAccount: boolean;
  createdAt: Date;
}

/** Result of approving an application or resending its setup link. */
export interface SetupLinkResult {
  /** Where the setup link was sent. */
  email: string;
  /** False when the mail server refused it (logged); the link itself is saved. */
  emailQueued: boolean;
  /** When the new link stops working. */
  expiresAt: Date;
}

/** Shape of a stakeholder application returned to the admin. */
export interface StakeholderApplication {
  id: string;
  type: string;
  fullName: string;
  title: string;
  email: string;
  country: string;
  website: string;
  phone: string;
  representing: string;
  involvement: string[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// createInvite
// ---------------------------------------------------------------------------

/**
 * Creates a new invite code, generated by the specified admin user.
 *
 * Generates a random code and inserts it into the `invite_codes` table with
 * status 'active'. Collision probability at realistic scales is negligible
 * (< 1 in a billion for fewer than 100 000 codes).
 *
 * @param adminUserId - UUID of the admin performing the action.
 * @returns The created invite record and its fully-formed invite link.
 * @throws AppError(500, "INSERT_FAILED") if the DB insert returns no row.
 */
export async function createInvite(adminUserId: string): Promise<InviteResult> {
  const code = generateCode();

  const [inserted] = await db
    .insert(inviteCodes)
    .values({
      code,
      createdBy: adminUserId,
      status: "active",
    })
    .returning({ id: inviteCodes.id, code: inviteCodes.code });

  if (!inserted) {
    throw new AppError("Failed to create invite code", 500, "INSERT_FAILED");
  }

  const inviteLink = `${FRONTEND_URL}/sign-up?code=${inserted.code}`;

  return { id: inserted.id, code: inserted.code, inviteLink };
}

// ---------------------------------------------------------------------------
// listInvites
// ---------------------------------------------------------------------------

/**
 * Returns all invite codes ordered by creation date descending.
 *
 * Performs a LEFT JOIN against the `users` table via the `used_by` FK to
 * populate the `usedBy` field when the code has been redeemed. Codes that
 * have not been used will have `usedBy: null`.
 *
 * @returns Array of invite records, each optionally including the user who used it.
 */
export async function listInvites(): Promise<InviteWithUser[]> {
  // Alias the users table so Drizzle doesn't mix up the joined columns with
  // the top-level users table that appears in other queries in this module.
  const usedByUser = {
    id: users.id,
    fullName: users.fullName,
    email: users.email,
    country: users.country,
    createdAt: users.createdAt,
  };

  const rows = await db
    .select({
      id: inviteCodes.id,
      code: inviteCodes.code,
      status: inviteCodes.status,
      createdAt: inviteCodes.createdAt,
      usedById: usedByUser.id,
      usedByFullName: usedByUser.fullName,
      usedByEmail: usedByUser.email,
      usedByCountry: usedByUser.country,
      usedByCreatedAt: usedByUser.createdAt,
    })
    .from(inviteCodes)
    .leftJoin(users, eq(inviteCodes.usedBy, users.id))
    .orderBy(desc(inviteCodes.createdAt));

  // Map flat JOIN rows to the nested InviteWithUser shape.
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    createdAt: row.createdAt,
    inviteLink: `${FRONTEND_URL}/sign-up?code=${row.code}`,
    usedBy: row.usedById
      ? {
          id: row.usedById,
          fullName: row.usedByFullName,
          email: row.usedByEmail,
          country: row.usedByCountry ?? null,
          createdAt: row.usedByCreatedAt,
        }
      : null,
  }));
}

// ---------------------------------------------------------------------------
// listMentorApplications
// ---------------------------------------------------------------------------

/**
 * Returns all mentor applications, optionally filtered by status.
 *
 * Results are ordered by creation date descending so the newest applications
 * appear first.
 *
 * @param status - Optional status filter (e.g. "pending", "approved", "rejected").
 *                 When omitted, all applications are returned.
 * @returns Array of mentor application records.
 */
export async function listMentorApplications(
  status?: string,
): Promise<MentorApplication[]> {
  const base = db
    .select({
      id: mentorRegistrations.id,
      name: mentorRegistrations.name,
      email: mentorRegistrations.email,
      linkedinUrl: mentorRegistrations.linkedinUrl,
      hourlyRate: mentorRegistrations.hourlyRate,
      expertise: mentorRegistrations.expertise,
      methods: mentorRegistrations.methods,
      passion: mentorRegistrations.passion,
      status: mentorRegistrations.status,
      userId: mentorRegistrations.userId,
      createdAt: mentorRegistrations.createdAt,
    })
    .from(mentorRegistrations)
    .orderBy(desc(mentorRegistrations.createdAt));

  const rows = await (status ? base.where(eq(mentorRegistrations.status, status)) : base);

  // Only whether an account exists goes out, never the user id or any token.
  return rows.map(({ userId, ...row }) => ({ ...row, hasAccount: userId !== null }));
}

// ---------------------------------------------------------------------------
// approveMentorApplication
// ---------------------------------------------------------------------------

/**
 * Approves a pending mentor application.
 *
 * 1. Fetch the application and verify it exists and is in 'pending' state.
 * 2. In one transaction: issue a 48-hour setup token (replacing any token row
 *    left from an earlier approval, e.g. after a manual status reset) and
 *    mark the application 'approved'.
 * 3. After the commit, email the mentor their setup link.
 *
 * Email is sent *outside* the transaction to avoid holding the DB connection
 * open during an external network call. If the email fails after the commit,
 * the status is still updated and the admin can use "Resend setup link".
 *
 * @param id - UUID of the mentor_registrations row.
 * @throws AppError(404, "NOT_FOUND")         — application does not exist.
 * @throws AppError(400, "ALREADY_PROCESSED") — application is not in 'pending' state.
 */
export async function approveMentorApplication(id: string): Promise<SetupLinkResult> {
  const found = await db
    .select()
    .from(mentorRegistrations)
    .where(eq(mentorRegistrations.id, id))
    .limit(1);

  const mentor = found[0];
  if (!mentor) {
    throw new AppError("Mentor application not found", 404, "NOT_FOUND");
  }

  if (mentor.status !== "pending") {
    throw new AppError(
      "This application has already been processed",
      400,
      "ALREADY_PROCESSED",
    );
  }

  const { token, expiresAt } = await db.transaction(async (tx) => {
    const issued = await issueSetupToken(tx, id);
    await tx
      .update(mentorRegistrations)
      .set({ status: "approved" })
      .where(eq(mentorRegistrations.id, id));
    return issued;
  });

  const emailQueued = await sendSetupLinkEmail(mentor, token);
  return { email: mentor.email, emailQueued, expiresAt };
}

// ---------------------------------------------------------------------------
// resendMentorSetupLink
// ---------------------------------------------------------------------------

/**
 * Sends an approved mentor who has not set up their account yet a new setup
 * link, e.g. after the 48-hour link expired.
 *
 * In one transaction, with the application row locked (so two clicks at once
 * cannot both send): check it can be resent, then replace the setup token, so
 * only the newest link works. The email goes out after the commit.
 *
 * @param id - UUID of the mentor_registrations row.
 * @throws AppError(404, "NOT_FOUND")       — application does not exist.
 * @throws AppError(400, "ALREADY_SET_UP")  — the mentor already has an account,
 *                                            or their setup link was already used.
 * @throws AppError(400, "NOT_RESENDABLE")  — the application is not approved.
 * @throws AppError(429, "RESEND_TOO_SOON") — a link was issued under a minute ago.
 */
export async function resendMentorSetupLink(id: string): Promise<SetupLinkResult> {
  const { mentor, token, expiresAt } = await db.transaction(async (tx) => {
    const [mentor] = await tx
      .select({
        id: mentorRegistrations.id,
        name: mentorRegistrations.name,
        email: mentorRegistrations.email,
        status: mentorRegistrations.status,
        userId: mentorRegistrations.userId,
      })
      .from(mentorRegistrations)
      .where(eq(mentorRegistrations.id, id))
      .limit(1)
      .for("update");

    if (!mentor) {
      throw new AppError("Mentor application not found", 404, "NOT_FOUND");
    }
    if (mentor.userId !== null) {
      throw new AppError("This mentor has already set up their account", 400, "ALREADY_SET_UP");
    }
    if (mentor.status !== "approved") {
      throw new AppError(
        "Only approved applications can be sent a setup link",
        400,
        "NOT_RESENDABLE",
      );
    }

    const [current] = await tx
      .select({
        usedAt: mentorSetupTokens.usedAt,
        recent: sql<boolean>`${mentorSetupTokens.createdAt} > now() - make_interval(secs => ${SETUP_LINK_RESEND_COOLDOWN_SECONDS})`,
      })
      .from(mentorSetupTokens)
      .where(eq(mentorSetupTokens.mentorRegistrationId, id))
      .limit(1);

    // A used link means an account was created from it (since removed); a
    // new link would recreate a login, so that stays a deliberate manual step.
    if (current?.usedAt) {
      throw new AppError("This mentor's setup link has already been used", 400, "ALREADY_SET_UP");
    }
    if (current?.recent) {
      throw new AppError(
        "A setup link was sent less than a minute ago. Please wait a moment before sending another.",
        429,
        "RESEND_TOO_SOON",
      );
    }

    return { mentor, ...(await issueSetupToken(tx, id)) };
  });

  const emailQueued = await sendSetupLinkEmail(mentor, token);
  return { email: mentor.email, emailQueued, expiresAt };
}

// ---------------------------------------------------------------------------
// rejectMentorApplication
// ---------------------------------------------------------------------------

/**
 * Rejects a mentor application by updating its status to 'rejected'.
 *
 * No email is sent on rejection — this can be added later if the product
 * requires notifying applicants of rejections.
 *
 * @param id - UUID of the mentor_registrations row.
 * @throws AppError(404, "NOT_FOUND") — application does not exist.
 */
export async function rejectMentorApplication(id: string): Promise<void> {
  const found = await db
    .select({ id: mentorRegistrations.id })
    .from(mentorRegistrations)
    .where(eq(mentorRegistrations.id, id))
    .limit(1);

  if (!found[0]) {
    throw new AppError("Mentor application not found", 404, "NOT_FOUND");
  }

  await db
    .update(mentorRegistrations)
    .set({ status: "rejected" })
    .where(eq(mentorRegistrations.id, id));
}

// ---------------------------------------------------------------------------
// listStakeholderApplications
// ---------------------------------------------------------------------------

/**
 * Returns all stakeholder registrations, optionally filtered by type.
 *
 * Results are ordered by creation date descending so the newest submissions
 * appear first.
 *
 * @param type - Optional type filter (e.g. "vc", "government", "corporate",
 *               "university", "incubator"). When omitted, all are returned.
 * @returns Array of stakeholder registration records.
 */
export async function listStakeholderApplications(
  type?: string,
): Promise<StakeholderApplication[]> {
  const query = db
    .select({
      id: stakeholderRegistrations.id,
      type: stakeholderRegistrations.type,
      fullName: stakeholderRegistrations.fullName,
      title: stakeholderRegistrations.title,
      email: stakeholderRegistrations.email,
      country: stakeholderRegistrations.country,
      website: stakeholderRegistrations.website,
      phone: stakeholderRegistrations.phone,
      representing: stakeholderRegistrations.representing,
      involvement: stakeholderRegistrations.involvement,
      createdAt: stakeholderRegistrations.createdAt,
    })
    .from(stakeholderRegistrations)
    .orderBy(desc(stakeholderRegistrations.createdAt));

  if (type) {
    return query.where(eq(stakeholderRegistrations.type, type));
  }

  return query;
}
