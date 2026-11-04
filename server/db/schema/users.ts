import { pgTable, uuid, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").unique().notNull(),
  // Better Auth: set once the user proves they own the address (a sign-up
  // code, a sign-in code or a verification code).
  emailVerified: boolean("email_verified").notNull().default(false),
  // True for every account created before Better Auth (migration 0022).
  // Their first code sign-in verifies the email and keeps their password;
  // see auth/legacyVerification.ts.
  legacyAccount: boolean("legacy_account").notNull().default(false),
  // Pre-Better-Auth bcrypt hash. Copied into auth_accounts by migration 0022
  // and no longer read or written; kept until a later release drops it.
  // Nullable: accounts created by email code have no password.
  passwordHash: text("password_hash"),
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
