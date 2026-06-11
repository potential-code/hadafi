import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const stakeholderRegistrations = pgTable("stakeholder_registrations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  fullName: text("full_name").notNull(),
  title: text("title").notNull(),
  email: text("email").notNull(),
  country: text("country").notNull(),
  website: text("website").notNull(),
  phone: text("phone").notNull(),
  representing: text("representing").notNull(),
  involvement: text("involvement").array().notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type StakeholderRegistration =
  typeof stakeholderRegistrations.$inferSelect;
export type InsertStakeholderRegistration =
  typeof stakeholderRegistrations.$inferInsert;
