import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { mediaFiles, type InsertMediaFile } from '../db/schema'

/**
 * Returns all media files ordered by creation date (oldest first).
 */
export async function listMediaFiles() {
  return db.select().from(mediaFiles).orderBy(mediaFiles.createdAt)
}

/**
 * Inserts a new media file record and returns the created row.
 *
 * @param data - Values conforming to InsertMediaFile
 */
export async function createMediaFile(data: InsertMediaFile) {
  const [file] = await db.insert(mediaFiles).values(data).returning()
  return file
}

/**
 * Fetches a single media file by its UUID.
 * Returns null if not found.
 *
 * @param id - UUID of the media file
 */
export async function getMediaFile(id: string) {
  const [file] = await db
    .select()
    .from(mediaFiles)
    .where(eq(mediaFiles.id, id))
    .limit(1)
  return file ?? null
}

/**
 * Fetches multiple media files by their UUIDs.
 * Returns an empty array when ids is empty (avoids a no-op DB round-trip).
 *
 * @param ids - Array of media file UUIDs
 */
export async function getMediaFilesByIds(ids: string[]) {
  if (ids.length === 0) return []
  return db.select().from(mediaFiles).where(inArray(mediaFiles.id, ids))
}

/**
 * Deletes a single media file record by its UUID.
 * Does not throw if the record does not exist.
 *
 * @param id - UUID of the media file
 */
export async function deleteMediaFile(id: string) {
  await db.delete(mediaFiles).where(eq(mediaFiles.id, id))
}

/**
 * Deletes multiple media file records by their UUIDs.
 * Short-circuits when ids is empty to avoid a no-op DB round-trip.
 *
 * @param ids - Array of media file UUIDs
 */
export async function deleteMediaFiles(ids: string[]) {
  if (ids.length === 0) return
  await db.delete(mediaFiles).where(inArray(mediaFiles.id, ids))
}
