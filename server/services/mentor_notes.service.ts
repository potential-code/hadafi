import { and, eq, sql } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import { db } from "../db";
import { mentorMenteeNotes, mentorSessions, users } from "../db/schema";
import { AppError } from "../utils/app-error";
import { createMediaFile } from "./media.service";

/** Max length of a notes field (session or mentee). */
export const MAX_NOTES_LENGTH = 20_000;

// ---------------------------------------------------------------------------
// Session notes
// ---------------------------------------------------------------------------

/**
 * Saves the mentor's private notes on one of their own sessions.
 *
 * @throws AppError(404, "NOT_FOUND")  — session does not exist
 * @throws AppError(403, "FORBIDDEN")  — session belongs to another mentor
 */
export async function saveSessionNotes(
  mentorUserId: string,
  sessionId: string,
  notes: string,
): Promise<{ id: string; mentorNotes: string }> {
  const [session] = await db
    .select({ id: mentorSessions.id, mentorUserId: mentorSessions.mentorUserId })
    .from(mentorSessions)
    .where(eq(mentorSessions.id, sessionId))
    .limit(1);

  if (!session) throw new AppError("Session not found", 404, "NOT_FOUND");
  if (session.mentorUserId !== mentorUserId) throw new AppError("Forbidden", 403, "FORBIDDEN");

  const [row] = await db
    .update(mentorSessions)
    .set({ mentorNotes: notes, updatedAt: new Date() })
    .where(eq(mentorSessions.id, sessionId))
    .returning({ id: mentorSessions.id, mentorNotes: mentorSessions.mentorNotes });

  return { id: row!.id, mentorNotes: row!.mentorNotes ?? "" };
}

// ---------------------------------------------------------------------------
// Mentee notes
// ---------------------------------------------------------------------------

export interface MenteeNotes {
  menteeId: string;
  notes: string;
  updatedAt: Date | null;
}

/**
 * A mentor may only keep notes on SMEs who have booked at least one session
 * with them (any status). Anyone else is reported as not found so mentors
 * can't probe for user ids.
 */
async function assertIsMentee(mentorUserId: string, menteeId: string): Promise<void> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(mentorSessions)
    .where(and(eq(mentorSessions.mentorUserId, mentorUserId), eq(mentorSessions.smeUserId, menteeId)))
    .limit(1);
  if (!row) throw new AppError("Mentee not found", 404, "MENTEE_NOT_FOUND");
}

/** Returns the mentor's notes on a mentee (empty string if none yet). */
export async function getMenteeNotes(mentorUserId: string, menteeId: string): Promise<MenteeNotes> {
  await assertIsMentee(mentorUserId, menteeId);
  const [row] = await db
    .select({ notes: mentorMenteeNotes.notes, updatedAt: mentorMenteeNotes.updatedAt })
    .from(mentorMenteeNotes)
    .where(and(eq(mentorMenteeNotes.mentorId, mentorUserId), eq(mentorMenteeNotes.menteeId, menteeId)))
    .limit(1);
  return { menteeId, notes: row?.notes ?? "", updatedAt: row?.updatedAt ?? null };
}

/** Creates or replaces the mentor's notes on a mentee. */
export async function saveMenteeNotes(
  mentorUserId: string,
  menteeId: string,
  notes: string,
): Promise<MenteeNotes> {
  await assertIsMentee(mentorUserId, menteeId);
  const now = new Date();
  const [row] = await db
    .insert(mentorMenteeNotes)
    .values({ mentorId: mentorUserId, menteeId, notes, updatedAt: now })
    .onConflictDoUpdate({
      target: [mentorMenteeNotes.mentorId, mentorMenteeNotes.menteeId],
      set: { notes, updatedAt: now },
    })
    .returning({ notes: mentorMenteeNotes.notes, updatedAt: mentorMenteeNotes.updatedAt });
  return { menteeId, notes: row!.notes, updatedAt: row!.updatedAt };
}

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------

const UPLOADS_DIR = path.join(__dirname, "..", "uploads", "media");

/** Detects JPEG/PNG/WebP from the file's leading bytes (never trusts the client's mimetype alone). */
function sniffImage(buf: Buffer): { ext: "jpg" | "png" | "webp"; mime: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ext: "png", mime: "image/png" };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

/**
 * Stores a mentor's profile photo under /uploads/media (same place as other
 * uploads, registered in media_files) and points users.avatar_url at it.
 *
 * @param mentorUserId - The authenticated mentor.
 * @param file         - Multer in-memory file (field `photo`).
 * @param publicBase   - Absolute origin the API is served from, used to build
 *                       a URL the client can load directly.
 * @throws AppError(415, "UNSUPPORTED_IMAGE") — not a real JPEG/PNG/WebP
 */
export async function saveMentorPhoto(
  mentorUserId: string,
  file: { buffer: Buffer; originalname: string; size: number },
  publicBase: string,
): Promise<{ avatarUrl: string }> {
  const kind = sniffImage(file.buffer);
  if (!kind) throw new AppError("Photo must be a JPEG, PNG or WebP image", 415, "UNSUPPORTED_IMAGE");

  const filename = `avatar-${mentorUserId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${kind.ext}`;
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, filename), file.buffer);

  await createMediaFile({
    originalName: file.originalname || filename,
    storedName: filename,
    mimeType: kind.mime,
    size: file.size,
    path: `uploads/media/${filename}`,
    uploadedBy: mentorUserId,
  });

  const avatarUrl = `${publicBase.replace(/\/$/, "")}/uploads/media/${filename}`;
  await db.update(users).set({ avatarUrl, updatedAt: new Date() }).where(eq(users.id, mentorUserId));
  return { avatarUrl };
}
