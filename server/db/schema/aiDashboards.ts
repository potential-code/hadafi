import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Saved AI Dashboard boards (ported from SMEEP).
 *
 * `charts` holds chart SPECS ONLY, never result rows: the agent's own SELECT
 * plus how its columns map onto a picture (server/services/ai-sql/chart-spec.ts).
 * Every render re-runs that SELECT through the AI SQL guard and the read-only
 * role, so a saved board can never show data the `ai` schema doesn't expose.
 *
 * Boards are shared by all admins: `createdBy` is audit metadata, and reads
 * are never filtered by it. `charts` is unconstrained at the DB level; the
 * read path drops entries that no longer parse, so a stale row degrades a
 * board instead of breaking the page.
 */
export const aiDashboards = pgTable(
  'ai_dashboards',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    title: text('title').notNull(),
    charts: jsonb('charts').notNull().default(sql`'[]'::jsonb`),
    // set null, not cascade: removing an admin must not delete shared boards.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
  },
  (t) => [index('ai_dashboards_updated_at_idx').on(t.updatedAt)],
)

export type AiDashboardRow = typeof aiDashboards.$inferSelect
