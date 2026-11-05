import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Homepage "Stay in the loop" sign-ups (ported from SMEEP). One row per address;
 * signing up again is a no-op. Unsubscribing sets `unsubscribedAt` rather than
 * deleting, so the opt-out is remembered. Nothing is emailed from here: the list
 * is exported by admins (Dashboard > Export > Newsletter subscribers).
 */
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  source: text('source').notNull().default('homepage'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
})

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect
