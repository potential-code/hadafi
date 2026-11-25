import { pgTable, uuid, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
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
  // The partner organisation a learner belongs to, or a partner contact
  // (role 'partner') works for. Leaving or being removed sets it back to null.
  organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "set null" }),
  points: integer("points").notNull().default(0),
  /** Learners appear on the leaderboard (as first name + initial) only if they turn this on. */
  showOnLeaderboard: boolean("show_on_leaderboard").notNull().default(false),
  /**
   * When the learner ticked "I agree to the Terms of Use and Privacy Policy"
   * at sign-up. Null for accounts created before it was recorded (and for
   * mentors and partners, who sign up another way).
   */
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  /**
   * Marketing consent: programme updates, offers and event invitations from
   * the Potential.org Foundation (sent to the CRM; see services/crmSync).
   * Off unless the learner ticked the optional box or turned it on later.
   * Not the same as announcement emails, which are a platform notification setting.
   */
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  /**
   * When marketingOptIn last changed: the opt-in, or the withdrawal if it was
   * turned off later (null: never opted in).
   */
  marketingOptInAt: timestamp("marketing_opt_in_at", { withTimezone: true }),
  /** The exact wording the learner agreed to (MARKETING_CONSENT_TEXT), server-side. */
  marketingConsentText: text("marketing_consent_text"),
  timezone: text("timezone"),
  meetingLink: text("meeting_link"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  // Tracks the last time this user made an authenticated API request.
  // Null means the user has never been tracked (e.g. pre-existing rows).
  // Updated by auth middleware on every authenticated request.
  lastActiveAt: timestamp("last_active_at"),
}, (t) => [index("users_organisation_id_idx").on(t.organisationId)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
