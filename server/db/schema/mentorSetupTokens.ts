import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { mentorRegistrations } from "./mentorRegistrations";

export const mentorSetupTokens = pgTable("mentor_setup_tokens", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  mentorRegistrationId: uuid("mentor_registration_id")
    .unique()
    .notNull()
    .references(() => mentorRegistrations.id, { onDelete: "cascade" }),
  token: text("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type MentorSetupToken = typeof mentorSetupTokens.$inferSelect;
export type InsertMentorSetupToken = typeof mentorSetupTokens.$inferInsert;
