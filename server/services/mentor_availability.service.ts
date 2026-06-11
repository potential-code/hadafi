import { eq, and, lt, gt, lte, or, asc, desc, count, countDistinct, inArray } from "drizzle-orm";

import { db } from "../db";
import { mentorAvailabilitySlots, mentorSessions, users } from "../db/schema";
import { AppError } from "../utils/app-error";

// Re-export the slot type for use in controllers/routes.
export type Slot = typeof mentorAvailabilitySlots.$inferSelect;

/** Flat DB row returned by the joined sessions query. */
interface SessionRow {
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
  smeName: string;
  smeEmail: string;
  smeAvatarUrl: string | null;
}

/** Session enriched with nested slot and smeUser objects — matches the frontend Session type. */
export interface SessionWithSlot {
  id: string;
  status: string;
  meetingLink: string | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  bookedAt: Date;
  slot: { startsAt: Date; endsAt: Date };
  smeUser: { fullName: string; email: string; avatarUrl: string | null };
}

function toSessionWithSlot(row: SessionRow): SessionWithSlot {
  return {
    id: row.id,
    status: row.status,
    meetingLink: row.meetingLink,
    cancelledBy: row.cancelledBy,
    cancelledAt: row.cancelledAt,
    bookedAt: row.bookedAt,
    slot: { startsAt: row.startsAt, endsAt: row.endsAt },
    smeUser: { fullName: row.smeName, email: row.smeEmail, avatarUrl: row.smeAvatarUrl },
  };
}

// ---------------------------------------------------------------------------
// addSlots
// ---------------------------------------------------------------------------

/**
 * Bulk-inserts availability slots for a mentor.
 *
 * Each slot is exactly 1 hour (endsAt = startsAt + 3600s).
 * Rejects slots whose startsAt is in the past.
 *
 * @param mentorUserId - The authenticated mentor's user ID.
 * @param slots        - Array of objects with a `startsAt` Date.
 * @returns The inserted slot rows.
 *
 * @throws AppError(400, "EMPTY_SLOTS")  — slots array is empty.
 * @throws AppError(400, "PAST_DATE")    — any slot starts at or before now.
 */
export async function addSlots(
  mentorUserId: string,
  slots: { startsAt: Date }[],
): Promise<{ inserted: Slot[]; skippedDuplicates: number }> {
  if (slots.length === 0) {
    throw new AppError("At least one slot is required", 400, "EMPTY_SLOTS");
  }

  const now = new Date();
  for (const slot of slots) {
    if (slot.startsAt <= now) {
      throw new AppError("Cannot add slots in the past", 400, "PAST_DATE");
    }
  }

  // Fetch any existing slots that clash with the incoming times.
  const existing = await db
    .select({ startsAt: mentorAvailabilitySlots.startsAt })
    .from(mentorAvailabilitySlots)
    .where(
      and(
        eq(mentorAvailabilitySlots.mentorUserId, mentorUserId),
        inArray(
          mentorAvailabilitySlots.startsAt,
          slots.map((s) => s.startsAt),
        ),
      ),
    );

  const takenMs = new Set(existing.map((s) => s.startsAt.getTime()));
  const newSlots = slots.filter((s) => !takenMs.has(s.startsAt.getTime()));
  const skippedDuplicates = slots.length - newSlots.length;

  if (newSlots.length === 0) {
    throw new AppError(
      "All selected slots already exist",
      409,
      "DUPLICATE_SLOTS",
    );
  }

  const values = newSlots.map((slot) => ({
    mentorUserId,
    startsAt: slot.startsAt,
    endsAt: new Date(slot.startsAt.getTime() + 60 * 60 * 1000),
    isAvailable: true,
  }));

  const inserted = await db
    .insert(mentorAvailabilitySlots)
    .values(values)
    .returning();

  return { inserted, skippedDuplicates };
}

// ---------------------------------------------------------------------------
// getSlots
// ---------------------------------------------------------------------------

/**
 * Returns all availability slots for a mentor split into upcoming and past buckets.
 *
 * Upcoming slots are sorted by startsAt ASC (next session first).
 * Past slots are sorted by startsAt DESC (most recent first).
 *
 * @param mentorUserId - The authenticated mentor's user ID.
 */
export async function getSlots(
  mentorUserId: string,
): Promise<{ upcoming: Slot[]; past: Slot[] }> {
  const now = new Date();

  const [upcomingRows, pastRows] = await Promise.all([
    db
      .select()
      .from(mentorAvailabilitySlots)
      .where(
        and(
          eq(mentorAvailabilitySlots.mentorUserId, mentorUserId),
          gt(mentorAvailabilitySlots.startsAt, now),
        ),
      )
      .orderBy(asc(mentorAvailabilitySlots.startsAt)),
    db
      .select()
      .from(mentorAvailabilitySlots)
      .where(
        and(
          eq(mentorAvailabilitySlots.mentorUserId, mentorUserId),
          lte(mentorAvailabilitySlots.startsAt, now),
        ),
      )
      .orderBy(desc(mentorAvailabilitySlots.startsAt)),
  ]);

  return { upcoming: upcomingRows, past: pastRows };
}

// ---------------------------------------------------------------------------
// deleteSlot
// ---------------------------------------------------------------------------

/**
 * Deletes a single availability slot owned by the given mentor.
 *
 * Prevents deletion of booked slots (isAvailable === false) to avoid
 * orphaning an already-confirmed session.
 *
 * @param mentorUserId - The authenticated mentor's user ID.
 * @param slotId       - UUID of the slot to delete.
 *
 * @throws AppError(404, "NOT_FOUND")           — slot does not exist or belongs to another mentor.
 * @throws AppError(409, "SLOT_ALREADY_BOOKED") — slot has been booked and cannot be removed.
 */
export async function deleteSlot(
  mentorUserId: string,
  slotId: string,
): Promise<void> {
  const [slot] = await db
    .select()
    .from(mentorAvailabilitySlots)
    .where(
      and(
        eq(mentorAvailabilitySlots.id, slotId),
        eq(mentorAvailabilitySlots.mentorUserId, mentorUserId),
      ),
    )
    .limit(1);

  if (!slot) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  if (!slot.isAvailable) {
    throw new AppError("Cannot delete a booked slot", 409, "SLOT_ALREADY_BOOKED");
  }

  await db
    .delete(mentorAvailabilitySlots)
    .where(eq(mentorAvailabilitySlots.id, slotId));
}

// ---------------------------------------------------------------------------
// bulkDeleteSlots
// ---------------------------------------------------------------------------

/**
 * Deletes multiple availability slots owned by the given mentor.
 *
 * Slots that are booked (isAvailable === false) or do not belong to this mentor
 * are silently skipped and counted in the `skipped` return value.
 *
 * @param mentorUserId - The authenticated mentor's user ID.
 * @param slotIds      - Array of slot UUIDs to delete.
 * @returns Object with `deleted` (successful deletions) and `skipped` (booked or not found) counts.
 */
export async function bulkDeleteSlots(
  mentorUserId: string,
  slotIds: string[],
): Promise<{ deleted: number; skipped: number }> {
  if (slotIds.length === 0) {
    return { deleted: 0, skipped: 0 };
  }

  // Fetch all matching slots that belong to this mentor in one query.
  const ownedSlots = await db
    .select()
    .from(mentorAvailabilitySlots)
    .where(
      and(
        inArray(mentorAvailabilitySlots.id, slotIds),
        eq(mentorAvailabilitySlots.mentorUserId, mentorUserId),
      ),
    );

  // Separate deletable (unbooked) from skippable (booked or not found).
  const deletableIds = ownedSlots
    .filter((s) => s.isAvailable)
    .map((s) => s.id);

  // Slots requested but not owned by this mentor are also skipped.
  const notOwned = slotIds.length - ownedSlots.length;
  const booked = ownedSlots.length - deletableIds.length;
  const skipped = notOwned + booked;

  if (deletableIds.length > 0) {
    await db
      .delete(mentorAvailabilitySlots)
      .where(inArray(mentorAvailabilitySlots.id, deletableIds));
  }

  return { deleted: deletableIds.length, skipped };
}

// ---------------------------------------------------------------------------
// getMentorAnalytics
// ---------------------------------------------------------------------------

/**
 * Returns high-level analytics for a mentor's dashboard overview card.
 *
 * - upcomingSessions:  confirmed sessions whose slot hasn't started yet.
 * - totalMentees:      distinct SME users who have ever booked this mentor.
 * - completedSessions: sessions marked as 'completed'.
 *
 * @param mentorUserId - The authenticated mentor's user ID.
 */
export async function getMentorAnalytics(mentorUserId: string): Promise<{
  upcomingSessions: number;
  totalMentees: number;
  completedSessions: number;
}> {
  const now = new Date();

  const [upcomingResult, menteesResult, completedResult] = await Promise.all([
    // Upcoming confirmed sessions: join to slots to filter by startsAt > now.
    db
      .select({ value: count() })
      .from(mentorSessions)
      .innerJoin(
        mentorAvailabilitySlots,
        eq(mentorSessions.slotId, mentorAvailabilitySlots.id),
      )
      .where(
        and(
          eq(mentorSessions.mentorUserId, mentorUserId),
          eq(mentorSessions.status, "confirmed"),
          gt(mentorAvailabilitySlots.startsAt, now),
        ),
      ),

    // Distinct mentees across all sessions (any status).
    db
      .select({ value: countDistinct(mentorSessions.smeUserId) })
      .from(mentorSessions)
      .where(eq(mentorSessions.mentorUserId, mentorUserId)),

    // Completed sessions.
    db
      .select({ value: count() })
      .from(mentorSessions)
      .where(
        and(
          eq(mentorSessions.mentorUserId, mentorUserId),
          eq(mentorSessions.status, "completed"),
        ),
      ),
  ]);

  return {
    upcomingSessions: Number(upcomingResult[0]?.value ?? 0),
    totalMentees: Number(menteesResult[0]?.value ?? 0),
    completedSessions: Number(completedResult[0]?.value ?? 0),
  };
}

// ---------------------------------------------------------------------------
// getMentorSessions
// ---------------------------------------------------------------------------

/**
 * Returns all sessions for a mentor, split into upcoming and past buckets,
 * enriched with slot timing and SME user details.
 *
 * Upcoming:  status = 'confirmed' AND slot.startsAt > now — sorted ASC.
 * Past:      slot.startsAt <= now (covers completed, cancelled, and any
 *            confirmed sessions whose window has passed) — sorted DESC.
 *
 * @param mentorUserId - The authenticated mentor's user ID.
 */
export async function getMentorSessions(mentorUserId: string): Promise<{
  upcoming: SessionWithSlot[];
  past: SessionWithSlot[];
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
    smeName: users.fullName,
    smeEmail: users.email,
    smeAvatarUrl: users.avatarUrl,
  } as const;

  const [upcomingRows, pastRows] = await Promise.all([
    db
      .select(sessionFields)
      .from(mentorSessions)
      .innerJoin(
        mentorAvailabilitySlots,
        eq(mentorSessions.slotId, mentorAvailabilitySlots.id),
      )
      .innerJoin(users, eq(mentorSessions.smeUserId, users.id))
      .where(
        and(
          eq(mentorSessions.mentorUserId, mentorUserId),
          eq(mentorSessions.status, "confirmed"),
          gt(mentorAvailabilitySlots.startsAt, now),
        ),
      )
      .orderBy(asc(mentorAvailabilitySlots.startsAt)),

    db
      .select(sessionFields)
      .from(mentorSessions)
      .innerJoin(
        mentorAvailabilitySlots,
        eq(mentorSessions.slotId, mentorAvailabilitySlots.id),
      )
      .innerJoin(users, eq(mentorSessions.smeUserId, users.id))
      .where(
        and(
          eq(mentorSessions.mentorUserId, mentorUserId),
          or(
            lte(mentorAvailabilitySlots.startsAt, now),
            inArray(mentorSessions.status, ["completed", "cancelled"]),
          ),
        ),
      )
      .orderBy(desc(mentorAvailabilitySlots.startsAt)),
  ]);

  return {
    upcoming: upcomingRows.map(toSessionWithSlot),
    past: pastRows.map(toSessionWithSlot),
  };
}
