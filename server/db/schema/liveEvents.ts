import { pgTable, uuid, text, timestamp, pgEnum, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/** Lifecycle status for a live event — matches the course_status pattern. */
export const liveEventStatusEnum = pgEnum('live_event_status', ['draft', 'published'])

/**
 * live_events — webinars and other live sessions (port of SMEEP e1cec80).
 *
 * `startsAt`/`endsAt` are the real times; `timezone` is the IANA zone the
 * admin entered them in (default UAE time). `date` and `time` are display
 * copies derived from `startsAt` on every save, kept for older readers (the
 * homepage, Hana's event cards, AI views).
 *
 * The event_times migration backfilled the real times from the old date
 * and free-text time. Rows it couldn't read are kept at noon on their date
 * with `timeNeedsReview`, and the original text stays in `legacyTime`.
 *
 * `format` is where it happens:
 *  - `zoom`: Hadafi creates a Zoom meeting and registers each booking with
 *    Zoom, so every learner gets her own join link;
 *  - `link`: any other link the admin pastes (Teams, Meet, YouTube…);
 *  - `in_person`: a place, in `location`.
 */
export const liveEvents = pgTable('live_events', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title:         text('title').notNull(),
  description:   text('description'),
  /** Freeform event type label, e.g. 'Webinar', 'Workshop'. */
  type:          text('type').notNull().default('Webinar'),
  /** Display copy of startsAt's day in the event's time zone, 'YYYY-MM-DD'. */
  date:          text('date').notNull(),
  /** Display copy of startsAt's time, e.g. '5:00 PM GST (UAE time)'. */
  time:          text('time').notNull(),
  startsAt:      timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt:        timestamp('ends_at', { withTimezone: true }).notNull(),
  /** IANA zone the start was entered in, e.g. 'Asia/Dubai'. */
  timezone:      text('timezone').notNull().default('Asia/Dubai'),
  /** The free-text time before the event_times migration, never thrown away. */
  legacyTime:    text('legacy_time'),
  /** The event_times migration couldn't read the old time: an admin should set it. */
  timeNeedsReview: boolean('time_needs_review').notNull().default(false),
  /** Places available; null means no limit. */
  capacity:      integer('capacity'),
  /** zoom | link | in_person */
  format:        text('format').notNull().default('link'),
  /** For format 'link': the meeting link. Only shown to learners who booked, near the start. */
  meetingLink:   text('meeting_link'),
  /** For format 'in_person': the venue. */
  location:      text('location'),
  recordingLink: text('recording_link'),
  /** URL or path to the event cover image. */
  coverImage:    text('cover_image'),
  status:        liveEventStatusEnum('status').notNull().default('draft'),

  // Zoom (format 'zoom'). The generic join URL is for admins only; learners
  // get their own registrant link. The host start URL is never stored.
  zoomMeetingId: text('zoom_meeting_id'),
  zoomJoinUrl:   text('zoom_join_url'),
  zoomPasscode:  text('zoom_passcode'),
  /** not_required | pending | active | failed */
  zoomStatus:    text('zoom_status').notNull().default('not_required'),
  zoomError:     text('zoom_error'),
  zoomSyncedAt:  timestamp('zoom_synced_at', { withTimezone: true }),
  /** From Zoom's webhooks: when the host actually started and ended it. */
  zoomStartedAt: timestamp('zoom_started_at', { withTimezone: true }),
  zoomEndedAt:   timestamp('zoom_ended_at', { withTimezone: true }),
  /** The finished sitting's UUID (meeting.ended), for the attendance report. */
  zoomLastMeetingUuid: text('zoom_last_meeting_uuid'),
  /** When attendance was read back from Zoom's report. */
  attendanceSyncedAt: timestamp('attendance_synced_at', { withTimezone: true }),

  /** FK to the admin user who created this event; nulled on user deletion. */
  createdBy:     uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:     timestamp('created_at').notNull().default(sql`now()`),
  updatedAt:     timestamp('updated_at').notNull().default(sql`now()`),
}, (t) => [index('live_events_starts_at_idx').on(t.startsAt)])

/** A learner's booking. For Zoom events it carries her personal Zoom link. */
export const eventRsvps = pgTable('event_rsvps', {
  id:               uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:          uuid('event_id').notNull().references(() => liveEvents.id, { onDelete: 'cascade' }),
  userId:           uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  zoomRegistrantId: text('zoom_registrant_id'),
  /** Hers alone; never shown to anyone else. */
  zoomJoinUrl:      text('zoom_join_url'),
  /** not_required | pending | active | failed */
  zoomStatus:       text('zoom_status').notNull().default('not_required'),
  zoomError:        text('zoom_error'),
}, (t) => [uniqueIndex('event_rsvps_event_user_idx').on(t.eventId, t.userId), index('event_rsvps_user_idx').on(t.userId)])

/**
 * Who attended a Zoom event, from Zoom's participants report: one row per
 * person (matched to a learner by registrant id, else email), all their
 * joins added up.
 */
export const eventAttendance = pgTable('event_attendance', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventId:       uuid('event_id').notNull().references(() => liveEvents.id, { onDelete: 'cascade' }),
  userId:        uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  /** registrant id, else email, else name: how joins are grouped. */
  matchKey:      text('match_key').notNull(),
  name:          text('name').notNull(),
  email:         text('email'),
  firstJoinedAt: timestamp('first_joined_at', { withTimezone: true }).notNull(),
  lastLeftAt:    timestamp('last_left_at', { withTimezone: true }),
  minutes:       integer('minutes').notNull().default(0),
}, (t) => [uniqueIndex('event_attendance_event_key_idx').on(t.eventId, t.matchKey)])

export type LiveEvent = typeof liveEvents.$inferSelect
export type InsertLiveEvent = typeof liveEvents.$inferInsert
export type EventRsvp = typeof eventRsvps.$inferSelect
export type EventAttendance = typeof eventAttendance.$inferSelect
