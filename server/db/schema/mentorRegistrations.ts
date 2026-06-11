import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const mentorRegistrations = pgTable("mentor_registrations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  linkedinUrl: text("linkedin_url"),
  hourlyRate: integer("hourly_rate"),
  expertise: text("expertise").array(),
  methods: text("methods").array(),
  passion: text("passion"),
  status: text("status").notNull().default("pending"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type MentorRegistration = typeof mentorRegistrations.$inferSelect;
export type InsertMentorRegistration = typeof mentorRegistrations.$inferInsert;
