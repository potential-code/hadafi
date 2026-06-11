import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Tracks all media files uploaded to S3 (videos, images, documents).
 * Serves as the central registry for the LMS media library.
 */
export const mediaFiles = pgTable('media_files', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  /** Original filename as provided by the uploader */
  originalName: text('original_name').notNull(),
  /** Key/path used when storing the file in S3 */
  storedName: text('stored_name').notNull(),
  /** MIME type (e.g. video/mp4, image/png) */
  mimeType: text('mime_type').notNull(),
  /** File size in bytes */
  size: integer('size').notNull(),
  /** Full S3 path or URL to the file */
  path: text('path').notNull(),
  /** FK to the user who uploaded this file */
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
})

export type MediaFile = typeof mediaFiles.$inferSelect
export type InsertMediaFile = typeof mediaFiles.$inferInsert
