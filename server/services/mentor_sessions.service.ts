import { eq, and, gt, lte, or, sql } from "drizzle-orm";

import { db } from "../db";
import { mentorAvailabilitySlots, mentorSessions, users } from "../db/schema";
import { AppError } from "../utils/app-error";
import { sendMail } from "../mail/mailer";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Date into a human-readable string using the recipient's timezone.
 * Falls back to UTC when timezone is null/undefined.
 *
 * @param date     - The Date to format
 * @param timezone - IANA timezone string (e.g. "America/New_York"), or null/undefined for UTC
 */
function formatDate(date: Date, timezone: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone ?? "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Flat DB row from the joined SME sessions query. */
interface SmeSessionRow {
  id: string;
  slotId: string;
  mentorUserId: string;
  smeUserId: string;
  status: string;
  meetingLink: string | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  bookedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  startsAt: Date;
  endsAt: Date;
  mentorName: string;
  mentorEmail: string;
  mentorAvatarUrl: string | null;
}

/** Session enriched with nested slot and mentorUser objects — matches the frontend SmeSession type. */
export interface SmeSessionWithDetails {
  id: string;
  status: string;
  meetingLink: string | null;
  slot: { startsAt: Date; endsAt: Date };
  mentorUser: { fullName: string; email: string; avatarUrl: string | null };
}

function toSmeSessionWithDetails(row: SmeSessionRow): SmeSessionWithDetails {
  return {
    id: row.id,
    status: row.status,
    meetingLink: row.meetingLink,
    slot: { startsAt: row.startsAt, endsAt: row.endsAt },
    mentorUser: { fullName: row.mentorName, email: row.mentorEmail, avatarUrl: row.mentorAvatarUrl },
  };
}

// ---------------------------------------------------------------------------
// bookSession
// ---------------------------------------------------------------------------

/**
 * Books an availability slot for an SME user.
 *
 * Validates the slot exists, is still available, and is in the future.
 * Inserts a `mentorSessions` row and flips the slot's `isAvailable` to false
 * in the same transaction to prevent double-booking.
 * Fires confirmation emails to both parties asynchronously (fire-and-forget).
 *
 * @param smeUserId - UUID of the authenticated SME user making the booking
 * @param slotId    - UUID of the availability slot to book
 * @returns The created session, the slot, and both user display names
 *
 * @throws AppError(404, "NOT_FOUND")         — slot does not exist
 * @throws AppError(409, "SLOT_UNAVAILABLE")  — slot is already booked
 * @throws AppError(400, "PAST_SLOT")         — slot start time is in the past
 */
export async function bookSession(
  smeUserId: string,
  slotId: string,
): Promise<{
  session: typeof mentorSessions.$inferSelect;
  slot: typeof mentorAvailabilitySlots.$inferSelect;
  mentorName: string;
  smeName: string;
}> {
  // --- All reads and writes happen inside the transaction to prevent race
  //     conditions where two concurrent requests both see isAvailable=true
  //     before either commits (double-booking). By re-fetching the slot under
  //     the transaction's isolation guarantees, the second concurrent request
  //     will block or see the updated row and fail the availability check.
  const { session, slot, mentor, sme } = await db.transaction(async (tx) => {
    // --- 1. Fetch the slot with FOR UPDATE (inside tx) --------------------------
    // SELECT ... FOR UPDATE acquires a row-level lock, forcing concurrent
    // booking attempts for the same slot to wait until this transaction
    // commits or rolls back. This prevents the READ COMMITTED double-booking
    // race where two transactions both read is_available=true before either
    // commits. Raw SQL is used because Drizzle's select() builder does not
    // support the FOR UPDATE clause.
    const locked = await tx.execute(
      sql`SELECT id, mentor_user_id, starts_at, ends_at, is_available FROM mentor_availability_slots WHERE id = ${slotId} FOR UPDATE`,
    );
    // Drizzle's execute() bypasses pg's type parsers — timestamps come back as
    // strings rather than Date objects even though pg would normally parse them.
    const txSlot = locked.rows[0] as
      | { id: string; mentor_user_id: string; starts_at: string; ends_at: string; is_available: boolean }
      | undefined;

    if (!txSlot) {
      throw new AppError("Slot not found", 404, "NOT_FOUND");
    }

    // Append "Z" to force UTC parsing — without it, new Date() treats the string
    // as the server's local timezone, which double-shifts the time on non-UTC servers.
    const slotStartsAt = new Date(txSlot.starts_at + "Z");
    const slotEndsAt = new Date(txSlot.ends_at + "Z");

    // --- 2. Availability guard --------------------------------------------------
    // Use snake_case field names — raw SQL returns columns as Postgres names them.
    if (!txSlot.is_available) {
      throw new AppError("This slot is no longer available", 409, "SLOT_UNAVAILABLE");
    }

    // --- 3. Past-slot guard -----------------------------------------------------
    if (slotStartsAt <= new Date()) {
      throw new AppError("Cannot book a slot in the past", 400, "PAST_SLOT");
    }

    // --- 4. Fetch mentor user (inside tx) ---------------------------------------
    const [txMentor] = await tx
      .select({
        fullName: users.fullName,
        email: users.email,
        timezone: users.timezone,
        meetingLink: users.meetingLink,
      })
      .from(users)
      .where(eq(users.id, txSlot.mentor_user_id))
      .limit(1);

    if (!txMentor) {
      throw new AppError("Mentor not found", 404, "NOT_FOUND");
    }

    // --- 5. Fetch SME user (inside tx) ------------------------------------------
    const [txSme] = await tx
      .select({
        fullName: users.fullName,
        email: users.email,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.id, smeUserId))
      .limit(1);

    if (!txSme) {
      throw new AppError("SME user not found", 404, "NOT_FOUND");
    }

    // --- 6. Insert session + mark slot unavailable ------------------------------
    const [inserted] = await tx
      .insert(mentorSessions)
      .values({
        slotId,
        // mentor_user_id from raw SQL is snake_case
        mentorUserId: txSlot.mentor_user_id,
        smeUserId,
        meetingLink: txMentor.meetingLink ?? null,
        // status defaults to "confirmed" in the schema
      })
      .returning();

    if (!inserted) {
      throw new AppError("Failed to create session", 500, "INSERT_FAILED");
    }

    // Use Drizzle's typed update (not raw SQL) — txSlot.id is the row UUID
    // from the FOR UPDATE query above.
    await tx
      .update(mentorAvailabilitySlots)
      .set({ isAvailable: false })
      .where(eq(mentorAvailabilitySlots.id, txSlot.id));

    // Re-map raw SQL row to the shape the rest of the function expects.
    // Use the already-parsed Date objects (slotStartsAt/slotEndsAt) so that
    // formatDate() receives proper Date values rather than raw strings.
    const slotForEmail = {
      id: txSlot.id,
      mentorUserId: txSlot.mentor_user_id,
      startsAt: slotStartsAt,
      endsAt: slotEndsAt,
      isAvailable: false,
    } as typeof mentorAvailabilitySlots.$inferSelect;

    return { session: inserted, slot: slotForEmail, mentor: txMentor, sme: txSme };
  });

  // --- 7. Fire-and-forget confirmation emails ----------------------------------
  // Run entirely in background — any failure here must never affect the 201
  // response because the booking transaction already committed.
  void (async () => {
    try {
      const smeSessionDate = formatDate(slot.startsAt, sme.timezone);
      const mentorSessionDate = formatDate(slot.startsAt, mentor.timezone);
      const emailContext = {
        mentorName: mentor.fullName,
        smeName: sme.fullName,
        meetingLink: mentor.meetingLink ?? null,
      };
      await Promise.all([
        sendMail({
          to: sme.email,
          subject: "Session confirmed!",
          template: "session-booked-sme",
          context: { ...emailContext, sessionDate: smeSessionDate },
        }),
        sendMail({
          to: mentor.email,
          subject: "New session booked",
          template: "session-booked-mentor",
          context: { ...emailContext, sessionDate: mentorSessionDate },
        }),
      ]);
      logger.info({ smeEmail: sme.email, mentorEmail: mentor.email }, "Booking confirmation emails sent");
    } catch (err) {
      logger.error({ err }, "Failed to send booking confirmation emails");
    }
  })();

  // --- 8. Return ---------------------------------------------------------------
  return {
    session,
    slot,
    mentorName: mentor.fullName,
    smeName: sme.fullName,
  };
}

// ---------------------------------------------------------------------------
// cancelSession
// ---------------------------------------------------------------------------

/**
 * Cancels a confirmed session on behalf of a mentor or SME.
 *
 * Validates the session exists, is in 'confirmed' state, and that the caller
 * owns the correct side of the session. Restores the slot's availability in
 * the same transaction. Sends a cancellation email to the OTHER party.
 *
 * @param userId    - UUID of the authenticated user requesting cancellation
 * @param sessionId - UUID of the session to cancel
 * @param role      - Whether the caller is the 'mentor' or 'sme' side
 *
 * @throws AppError(404, "NOT_FOUND")       — session does not exist
 * @throws AppError(400, "INVALID_STATUS")  — session is not in 'confirmed' state
 * @throws AppError(403, "FORBIDDEN")       — caller does not own the relevant side
 */
export async function cancelSession(
  userId: string,
  sessionId: string,
  role: "mentor" | "sme",
): Promise<void> {
  // --- 1. Fetch session + slot in a single join --------------------------------
  const [row] = await db
    .select({
      id: mentorSessions.id,
      status: mentorSessions.status,
      mentorUserId: mentorSessions.mentorUserId,
      smeUserId: mentorSessions.smeUserId,
      meetingLink: mentorSessions.meetingLink,
      slotId: mentorSessions.slotId,
      startsAt: mentorAvailabilitySlots.startsAt,
    })
    .from(mentorSessions)
    .innerJoin(
      mentorAvailabilitySlots,
      eq(mentorSessions.slotId, mentorAvailabilitySlots.id),
    )
    .where(eq(mentorSessions.id, sessionId))
    .limit(1);

  if (!row) {
    throw new AppError("Session not found", 404, "NOT_FOUND");
  }

  // --- 2. Ownership check ------------------------------------------------------
  // Ownership is validated against the DB row — not a security race, so
  // checking before the transaction is fine.
  if (role === "mentor" && userId !== row.mentorUserId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
  if (role === "sme" && userId !== row.smeUserId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  // --- 3. Transaction: atomic cancel + restore slot ----------------------------
  // The UPDATE's WHERE clause includes `status = 'confirmed'` so that if two
  // concurrent cancel requests both pass the ownership check above, only the
  // first one to reach this UPDATE will match a row — the second will get an
  // empty result set and throw, preventing a double cancellation email.
  // `updatedAt` was previously missing from this update; added here.
  await db.transaction(async (tx) => {
    const result = await tx
      .update(mentorSessions)
      .set({
        status: "cancelled",
        cancelledBy: role,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mentorSessions.id, sessionId),
          eq(mentorSessions.status, "confirmed"), // atomic guard against TOCTOU
        ),
      )
      .returning({ id: mentorSessions.id });

    if (result.length === 0) {
      // Either the session was concurrently cancelled or was never confirmed.
      throw new AppError(
        "Session is not in a confirmable state or was already cancelled",
        409,
        "SESSION_NOT_CANCELLABLE",
      );
    }

    await tx
      .update(mentorAvailabilitySlots)
      .set({ isAvailable: true })
      .where(eq(mentorAvailabilitySlots.id, row.slotId));
  });

  // --- 5. Fetch mentor + SME names/emails for notification --------------------
  const [mentor] = await db
    .select({ fullName: users.fullName, email: users.email, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, row.mentorUserId))
    .limit(1);

  const [sme] = await db
    .select({ fullName: users.fullName, email: users.email, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, row.smeUserId))
    .limit(1);

  if (!mentor || !sme) {
    console.warn(`Could not find user details for session ${sessionId} notification email`);
    return;
  }

  const emailContext = {
    mentorName: mentor.fullName,
    smeName: sme.fullName,
    cancelledBy: role,
  };

  // --- 6. Fire-and-forget cancellation email to the OTHER party ---------------
  if (role === "sme") {
    // SME cancelled — notify the mentor
    sendMail({
      to: mentor.email,
      subject: "Session cancelled",
      template: "session-cancelled-mentor",
      context: {
        ...emailContext,
        sessionDate: formatDate(row.startsAt, mentor.timezone),
      },
    }).catch(console.error);
  } else {
    // Mentor cancelled — notify the SME
    sendMail({
      to: sme.email,
      subject: "Session cancelled",
      template: "session-cancelled-sme",
      context: {
        ...emailContext,
        sessionDate: formatDate(row.startsAt, sme.timezone),
      },
    }).catch(console.error);
  }
}

// ---------------------------------------------------------------------------
// completeSession
// ---------------------------------------------------------------------------

/**
 * Marks a confirmed session as completed.
 *
 * Only the mentor who owns the session may complete it.
 *
 * @param mentorUserId - UUID of the authenticated mentor
 * @param sessionId    - UUID of the session to complete
 *
 * @throws AppError(404, "NOT_FOUND")       — session does not exist
 * @throws AppError(403, "FORBIDDEN")       — caller is not the session's mentor
 * @throws AppError(400, "INVALID_STATUS")  — session is not in 'confirmed' state
 */
export async function completeSession(
  mentorUserId: string,
  sessionId: string,
): Promise<void> {
  // --- 1. Fetch the session ----------------------------------------------------
  const [session] = await db
    .select()
    .from(mentorSessions)
    .where(eq(mentorSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new AppError("Session not found", 404, "NOT_FOUND");
  }

  // --- 2. Ownership check ------------------------------------------------------
  if (session.mentorUserId !== mentorUserId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  // --- 3. Status guard ---------------------------------------------------------
  if (session.status !== "confirmed") {
    throw new AppError("Session cannot be completed", 400, "INVALID_STATUS");
  }

  // --- 4. Mark as completed ----------------------------------------------------
  await db
    .update(mentorSessions)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(mentorSessions.id, sessionId));
}

// ---------------------------------------------------------------------------
// getSmeSessions
// ---------------------------------------------------------------------------

/**
 * Returns all sessions for an SME user split into upcoming and past buckets,
 * enriched with slot timing and mentor user details.
 *
 * Upcoming: status = 'confirmed' AND slot.startsAt > now — sorted ASC.
 * Past:     status is 'cancelled' or 'completed', or slot.startsAt <= now — sorted DESC.
 *
 * @param smeUserId - UUID of the authenticated SME user
 * @returns `{ upcoming: SmeSessionWithDetails[], past: SmeSessionWithDetails[] }`
 */
export async function getSmeSessions(smeUserId: string): Promise<{
  upcoming: SmeSessionWithDetails[];
  past: SmeSessionWithDetails[];
}> {
  const now = new Date();

  // Shared column selection — reused for both upcoming and past queries.
  const sessionFields = {
    id: mentorSessions.id,
    slotId: mentorSessions.slotId,
    mentorUserId: mentorSessions.mentorUserId,
    smeUserId: mentorSessions.smeUserId,
    status: mentorSessions.status,
    meetingLink: mentorSessions.meetingLink,
    cancelledBy: mentorSessions.cancelledBy,
    cancelledAt: mentorSessions.cancelledAt,
    bookedAt: mentorSessions.bookedAt,
    createdAt: mentorSessions.createdAt,
    updatedAt: mentorSessions.updatedAt,
    startsAt: mentorAvailabilitySlots.startsAt,
    endsAt: mentorAvailabilitySlots.endsAt,
    mentorName: users.fullName,
    mentorEmail: users.email,
    mentorAvatarUrl: users.avatarUrl,
  } as const;

  const [upcomingRows, pastRows] = await Promise.all([
    // Upcoming: confirmed sessions that haven't started yet
    db
      .select(sessionFields)
      .from(mentorSessions)
      .innerJoin(
        mentorAvailabilitySlots,
        eq(mentorSessions.slotId, mentorAvailabilitySlots.id),
      )
      .innerJoin(users, eq(mentorSessions.mentorUserId, users.id))
      .where(
        and(
          eq(mentorSessions.smeUserId, smeUserId),
          eq(mentorSessions.status, "confirmed"),
          gt(mentorAvailabilitySlots.startsAt, now),
        ),
      )
      .orderBy(mentorAvailabilitySlots.startsAt),

    // Past: cancelled, completed, or slot time already passed
    db
      .select(sessionFields)
      .from(mentorSessions)
      .innerJoin(
        mentorAvailabilitySlots,
        eq(mentorSessions.slotId, mentorAvailabilitySlots.id),
      )
      .innerJoin(users, eq(mentorSessions.mentorUserId, users.id))
      .where(
        and(
          eq(mentorSessions.smeUserId, smeUserId),
          or(
            eq(mentorSessions.status, "cancelled"),
            eq(mentorSessions.status, "completed"),
            lte(mentorAvailabilitySlots.startsAt, now),
          ),
        ),
      )
      .orderBy(mentorAvailabilitySlots.startsAt),
  ]);

  const sortedPast = [...pastRows].sort(
    (a, b) => b.startsAt.getTime() - a.startsAt.getTime(),
  );

  return {
    upcoming: upcomingRows.map(toSmeSessionWithDetails),
    past: sortedPast.map(toSmeSessionWithDetails),
  };
}
