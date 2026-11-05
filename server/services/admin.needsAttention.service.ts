import { and, asc, count, eq, gte, isNull, lte } from "drizzle-orm";

import { db } from "../db";
import {
  courses,
  inviteCodes,
  mentorAvailabilitySlots,
  mentorRegistrations,
  mentorSessions,
  stakeholderRegistrations,
} from "../db/schema";

/** Window for "new" stakeholder applications (they have no review status). */
export const STAKEHOLDER_ATTENTION_DAYS = 30;
/** Cap on unused invite codes returned (oldest first). */
const MAX_UNUSED_INVITES = 50;

export interface NeedsAttention {
  pendingMentorApplications: number;
  pendingStakeholderApplications: number;
  draftCourses: number;
  unusedInviteCodes: { code: string; createdAt: Date }[];
  mentorSessionsNeedingCompletion: number;
}

/**
 * Real counts for the admin dashboard's "Needs attention" panel.
 *
 * - pendingMentorApplications: mentor_registrations with status 'pending'.
 * - pendingStakeholderApplications: stakeholder registrations have no review
 *   workflow (no status column), so this counts the ones received in the last
 *   STAKEHOLDER_ATTENTION_DAYS days.
 * - draftCourses: courses with status 'draft' (not published to learners).
 * - unusedInviteCodes: active codes nobody has redeemed, oldest first.
 * - mentorSessionsNeedingCompletion: sessions still 'confirmed' after their
 *   end time (all mentors).
 */
export async function getNeedsAttention(): Promise<NeedsAttention> {
  const now = new Date();
  const since = new Date(now.getTime() - STAKEHOLDER_ATTENTION_DAYS * 86_400_000);

  const [mentorApps, stakeholderApps, drafts, invites, sessions] = await Promise.all([
    db.select({ n: count() }).from(mentorRegistrations).where(eq(mentorRegistrations.status, "pending")),
    db
      .select({ n: count() })
      .from(stakeholderRegistrations)
      .where(gte(stakeholderRegistrations.createdAt, since)),
    db.select({ n: count() }).from(courses).where(eq(courses.status, "draft")),
    db
      .select({ code: inviteCodes.code, createdAt: inviteCodes.createdAt })
      .from(inviteCodes)
      .where(and(eq(inviteCodes.status, "active"), isNull(inviteCodes.usedBy), isNull(inviteCodes.usedAt)))
      .orderBy(asc(inviteCodes.createdAt))
      .limit(MAX_UNUSED_INVITES),
    db
      .select({ n: count() })
      .from(mentorSessions)
      .innerJoin(mentorAvailabilitySlots, eq(mentorSessions.slotId, mentorAvailabilitySlots.id))
      .where(and(eq(mentorSessions.status, "confirmed"), lte(mentorAvailabilitySlots.endsAt, now))),
  ]);

  return {
    pendingMentorApplications: Number(mentorApps[0]?.n ?? 0),
    pendingStakeholderApplications: Number(stakeholderApps[0]?.n ?? 0),
    draftCourses: Number(drafts[0]?.n ?? 0),
    unusedInviteCodes: invites,
    mentorSessionsNeedingCompletion: Number(sessions[0]?.n ?? 0),
  };
}
