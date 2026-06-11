import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/** Lifecycle status for a live event — matches the course_status pattern. */
export const liveEventStatusEnum = pgEnum('live_event_status', ['draft', 'published'])

/**
 * live_events — stores webinars and other live sessions.
 *
 * `date` is stored as a plain text ISO string ('YYYY-MM-DD') to avoid
 * timezone coercion; `time` is a freeform display string (e.g. '5:00 PM / GST').
 */
export const liveEvents = pgTable('live_events', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title:         text('title').notNull(),
  description:   text('description'),
  /** Freeform event type label, e.g. 'Webinar', 'Workshop'. */
  type:          text('type').notNull().default('Webinar'),
  /** ISO date string 'YYYY-MM-DD'. Stored as text to avoid TZ coercion. */
  date:          text('date').notNull(),
  /** Display time string, e.g. '5:00 PM / GST - UAE time'. */
  time:          text('time').notNull(),
  meetingLink:   text('meeting_link'),
  recordingLink: text('recording_link'),
  /** URL or path to the event cover image. */
  coverImage:    text('cover_image'),
  status:        liveEventStatusEnum('status').notNull().default('draft'),
  /** FK to the admin user who created this event; nulled on user deletion. */
  createdBy:     uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:     timestamp('created_at').notNull().default(sql`now()`),
  updatedAt:     timestamp('updated_at').notNull().default(sql`now()`),
})

export type LiveEvent = typeof liveEvents.$inferSelect
export type InsertLiveEvent = typeof liveEvents.$inferInsert
