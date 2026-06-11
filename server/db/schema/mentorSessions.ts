import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { mentorAvailabilitySlots } from "./mentorAvailabilitySlots";

export const mentorSessions = pgTable(
  "mentor_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => mentorAvailabilitySlots.id, { onDelete: "restrict" }),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    smeUserId: uuid("sme_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // 'confirmed' | 'cancelled' | 'completed' — enforced at app layer
    status: text("status").notNull().default("confirmed"),
    meetingLink: text("meeting_link"),
    // 'mentor' | 'sme' — enforced at app layer
    cancelledBy: text("cancelled_by"),
    cancelledAt: timestamp("cancelled_at"),
    bookedAt: timestamp("booked_at").notNull().default(sql`now()`),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (table) => [
    index("mentor_sessions_mentor_status_idx").on(table.mentorUserId, table.status),
    index("mentor_sessions_sme_status_idx").on(table.smeUserId, table.status),
    // Partial unique index: only one non-cancelled session per slot may exist at
    // a time. Cancelled sessions are excluded so a slot can be rebooked after
    // cancellation. This is the DB-level guard against double-booking that
    // complements the FOR UPDATE lock in bookSession.
    uniqueIndex("mentor_sessions_slot_active_idx")
      .on(table.slotId)
      .where(sql`${table.status} != 'cancelled'`),
  ]
);

export type MentorSession = typeof mentorSessions.$inferSelect;
export type InsertMentorSession = typeof mentorSessions.$inferInsert;
