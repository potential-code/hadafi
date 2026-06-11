import { and, eq, gt, asc } from "drizzle-orm";

import { db } from "../db";
import { mentorAvailabilitySlots, mentorRegistrations, users } from "../db/schema";

// ---------------------------------------------------------------------------
// getMentorsList
// ---------------------------------------------------------------------------

/**
 * Returns all users with the 'mentor' role, joined with their registration
 * record to include LinkedIn URL and areas of expertise.
 *
 * Uses a LEFT JOIN so mentors who were created without a corresponding
 * mentor_registrations row are still returned (linkedinUrl and expertise
 * will be null for those users).
 *
 * Only safe public fields are selected — no passwordHash or sensitive data.
 *
 * @returns Array of mentor user objects with optional registration fields
 */
export async function getMentorsList(): Promise<
  {
    id: string;
    fullName: string;
    email: string;
    bio: string | null;
    meetingLink: string | null;
    timezone: string | null;
    avatarUrl: string | null;
    linkedinUrl: string | null;
    expertise: string[] | null;
  }[]
> {
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      bio: users.bio,
      meetingLink: users.meetingLink,
      timezone: users.timezone,
      avatarUrl: users.avatarUrl,
      linkedinUrl: mentorRegistrations.linkedinUrl,
      expertise: mentorRegistrations.expertise,
    })
    .from(users)
    .leftJoin(
      mentorRegistrations,
      eq(mentorRegistrations.userId, users.id),
    )
    .where(eq(users.role, "mentor"));
}

// ---------------------------------------------------------------------------
// getMentorAvailability
// ---------------------------------------------------------------------------

/** A single available slot with its timing. */
export interface AvailableSlot {
  id: string;
  startsAt: Date;
  endsAt: Date;
  isAvailable: boolean;
}

/**
 * Returns all available (unbooked, future) slots for a given mentor,
 * grouped by calendar date (YYYY-MM-DD in UTC).
 *
 * Slots are sorted by startsAt ASC before grouping so each bucket is in order.
 *
 * @param mentorUserId - UUID of the mentor whose availability to fetch
 * @returns A map of date string to array of slots, e.g.
 *          `{ "2025-06-10": [{ id, startsAt, endsAt, isAvailable }], ... }`
 */
export async function getMentorAvailability(
  mentorUserId: string,
): Promise<Record<string, AvailableSlot[]>> {
  const now = new Date();

  const slots = await db
    .select({
      id: mentorAvailabilitySlots.id,
      startsAt: mentorAvailabilitySlots.startsAt,
      endsAt: mentorAvailabilitySlots.endsAt,
      isAvailable: mentorAvailabilitySlots.isAvailable,
    })
    .from(mentorAvailabilitySlots)
    .where(
      // Filter at the DB level: only future, unbooked slots for this mentor.
      // Pushing isAvailable and startsAt checks into the query avoids fetching
      // rows that will always be discarded, which matters once a mentor has many
      // historical or already-booked slots.
      and(
        eq(mentorAvailabilitySlots.mentorUserId, mentorUserId),
        eq(mentorAvailabilitySlots.isAvailable, true),
        gt(mentorAvailabilitySlots.startsAt, now),
      ),
    )
    .orderBy(asc(mentorAvailabilitySlots.startsAt));

  // All filtering is now done in the query; alias for clarity.
  const available = slots;

  // Group by YYYY-MM-DD (UTC date string)
  const grouped: Record<string, AvailableSlot[]> = {};
  for (const slot of available) {
    const dateKey = slot.startsAt.toISOString().split("T")[0] as string;
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(slot);
  }

  return grouped;
}
