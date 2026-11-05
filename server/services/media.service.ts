import fs from 'fs/promises'
import path from 'path'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { mediaFiles, type InsertMediaFile } from '../db/schema'
import { UPLOADS_ROOT } from '../middleware/upload'

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

// ---------------------------------------------------------------------------
// Upload safety
// ---------------------------------------------------------------------------

const ascii = (buf: Buffer, start: number, end: number) => buf.subarray(start, end).toString('latin1')

/** ISO base-media (MP4 / MOV): a box size, then "ftyp" or an early QuickTime atom. */
function isIsoMedia(head: Buffer): boolean {
  return head.length >= 12 && ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(ascii(head, 4, 8))
}

/**
 * An SVG document: optional BOM, XML prolog, comments and doctype, then the
 * <svg> root. Anything else (an HTML page saved as .svg) is refused.
 */
function isSvg(head: Buffer): boolean {
  const text = head.toString('utf8').replace(/^\uFEFF/, '')
  return /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE\s+svg[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)
}

const SIGNATURES: Record<string, (head: Buffer) => boolean> = {
  'image/jpeg': (h) => h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  'image/png': (h) => h.length >= 8 && h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (h) => ['GIF87a', 'GIF89a'].includes(ascii(h, 0, 6)),
  'image/webp': (h) => ascii(h, 0, 4) === 'RIFF' && ascii(h, 8, 12) === 'WEBP',
  'image/svg+xml': isSvg,
  'application/pdf': (h) => ascii(h, 0, 5) === '%PDF-',
  // Word 97-2003 (OLE compound file) and .docx (a zip).
  'application/msword': (h) => h.length >= 8 && h.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (h) => ascii(h, 0, 4) === 'PK\x03\x04',
  'video/mp4': isIsoMedia,
  'video/quicktime': isIsoMedia,
  'video/webm': (h) => h.length >= 4 && h.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
}

/**
 * True when the file's leading bytes are the type the browser claimed. The
 * browser's type is only a label; this stops, say, an HTML page sent as
 * image/png or image/svg+xml from entering the library.
 */
export async function contentMatchesType(filePath: string, mimeType: string): Promise<boolean> {
  const check = SIGNATURES[mimeType]
  if (!check) return false
  const handle = await fs.open(filePath, 'r')
  try {
    // SVGs may open with a long comment or doctype; other formats need 12 bytes.
    const head = Buffer.alloc(mimeType === 'image/svg+xml' ? 4096 : 16)
    const { bytesRead } = await handle.read(head, 0, head.length, 0)
    return check(head.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

/** Absolute location on disk of a stored media path ("uploads/media/<name>"). */
export function mediaDiskPath(storedPath: string): string {
  const rel = storedPath.replace(/^\/?uploads\//, '')
  const full = path.resolve(UPLOADS_ROOT, rel)
  // Stored paths are written by this server, but never reach outside /uploads.
  if (!full.startsWith(path.resolve(UPLOADS_ROOT) + path.sep)) throw new Error(`Media path outside uploads: ${storedPath}`)
  return full
}

/** Removes a stored file from disk; a file that is already gone is fine. */
export async function removeMediaFromDisk(storedPath: string): Promise<void> {
  await fs.unlink(mediaDiskPath(storedPath)).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err
  })
}
