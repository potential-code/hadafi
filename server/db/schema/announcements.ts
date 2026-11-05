import { pgTable, uuid, text, timestamp, boolean, integer, index, primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Announcements from the Hadafi team (ported from SMEEP): a banner at the top
 * of the audience's pages, a bell notification and, once the client approves
 * learner emails (ANNOUNCEMENT_EMAILS_ENABLED), an email.
 *
 * `status` is what the admin chose: draft, scheduled (goes out at
 * `startsAt`) or sent. Live and ended are worked out from `endsAt` and
 * `archivedAt` (set when the banner comes down, early or on its end date).
 */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** An in-app path (/dashboard/courses) or an https:// link. */
    linkUrl: text('link_url'),
    linkLabel: text('link_label'),
    /** learners | mentors | all. Other kinds (e.g. one organisation) plug in via `audienceRef`. */
    audience: text('audience').notNull().default('learners'),
    /** The id the audience kind needs (an organisation id, say); null for the built-in kinds. */
    audienceRef: text('audience_ref'),
    showBanner: boolean('show_banner').notNull().default(true),
    notify: boolean('notify').notNull().default(true),
    email: boolean('email').notNull().default(false),
    /** draft | scheduled | sent */
    status: text('status').notNull().default('draft'),
    /** When it goes (or went) out. */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    /** When the banner and unread bell items come down; null keeps it up until an admin ends it. */
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** How many people it was sent to (the "of N" in reach). */
    audienceSize: integer('audience_size').notNull().default(0),
    emailRecipients: integer('email_recipients').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    /** Set when it ends: an admin took it down, or its end date passed. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    index('announcements_created_idx').on(t.createdAt),
    index('announcements_status_starts_idx').on(t.status, t.startsAt),
  ],
)

/** Who has been shown an announcement's banner (for reach). */
export const announcementViews = pgTable(
  'announcement_views',
  {
    announcementId: uuid('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.announcementId, t.userId] })],
)

/** People who turned announcement emails off (from an email's unsubscribe link). */
export const announcementEmailOptOuts = pgTable('announcement_email_opt_outs', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type Announcement = typeof announcements.$inferSelect
