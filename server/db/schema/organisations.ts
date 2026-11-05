import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Partner organisations (a ministry, university, corporate, incubator…) whose
 * learners Hadafi tracks together. Learners join with the organisation's
 * reusable sign-up link (/sign-up?org=CODE) or an admin adds them
 * (users.organisation_id); partner contacts are users with role 'partner' and
 * the same organisation_id, who see a read-only dashboard of those learners.
 * Ported from SMEEP db40881.
 *
 * created_by is a plain uuid (no FK) so this file needn't import users, which
 * references this table.
 */
export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  /** government | university | corporate | incubator | investor | other */
  type: text('type').notNull().default('other'),
  joinCode: text('join_code').notNull().unique(),
  joinEnabled: boolean('join_enabled').notNull().default(true),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  archivedAt: timestamp('archived_at'),
})

export type Organisation = typeof organisations.$inferSelect
