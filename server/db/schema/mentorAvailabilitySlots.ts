import {
  pgTable,
  uuid,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const mentorAvailabilitySlots = pgTable(
  "mentor_availability_slots",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (table) => [index("mentor_avail_mentor_starts_idx").on(table.mentorUserId, table.startsAt)]
);

export type MentorAvailabilitySlot = typeof mentorAvailabilitySlots.$inferSelect;
export type InsertMentorAvailabilitySlot = typeof mentorAvailabilitySlots.$inferInsert;
