import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("sme"),
  country: text("country"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  company: text("company"),
  phone: text("phone"),
  // inviteCodeId is added as a plain uuid here; the FK reference to invite_codes
  // is defined in inviteCodes.ts to avoid the circular dependency at module load time.
  // The FK constraint is established via the migration; no .references() here.
  inviteCodeId: uuid("invite_code_id"),
  points: integer("points").notNull().default(0),
  timezone: text("timezone"),
  meetingLink: text("meeting_link"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  // Tracks the last time this user made an authenticated API request.
  // Null means the user has never been tracked (e.g. pre-existing rows).
  // Updated by auth middleware on every authenticated request.
  lastActiveAt: timestamp("last_active_at"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
