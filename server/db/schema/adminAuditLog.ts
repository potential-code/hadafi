import { pgTable, uuid, text, timestamp, integer, jsonb, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Who changed what, as admin. One row per mutating request (POST, PUT, PATCH,
 * DELETE) under /api made by an admin session or an operator key, and per
 * bulk export downloaded with an operator key. Written after the response is
 * sent (middleware/audit-log.ts), so it never slows or fails a request.
 *
 * `actor_user_id` deliberately has no foreign key: deleting a user must not
 * delete or blank the record of what they did.
 */
export const adminAuditLog = pgTable('admin_audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  at: timestamp('at', { withTimezone: true }).notNull().default(sql`now()`),
  actorUserId: uuid('actor_user_id'),
  /** 'session' (signed-in admin) | 'operator_key' (Authorization: Bearer). */
  actorKind: text('actor_kind').notNull(),
  /** The operator key's label from OPERATOR_API_KEYS; null for sessions. */
  keyLabel: text('key_label'),
  method: text('method').notNull(),
  /** Request path without the query string. */
  path: text('path').notNull(),
  statusCode: integer('status_code').notNull(),
  /** The route params (e.g. { id }), when the route has any. */
  targetIds: jsonb('target_ids').$type<Record<string, string>>(),
  /** { query?, body? } with passwords, tokens, secrets and keys redacted. */
  requestSummary: jsonb('request_summary').$type<Record<string, unknown>>(),
  ip: text('ip'),
}, (t) => [
  index('admin_audit_log_at_idx').on(t.at),
  index('admin_audit_log_actor_at_idx').on(t.actorUserId, t.at),
  check('admin_audit_log_actor_kind_check', sql`${t.actorKind} in ('session', 'operator_key')`),
])

export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect
export type InsertAdminAuditLogRow = typeof adminAuditLog.$inferInsert
