import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { notifications, users, type Notification } from "../db/schema";
import { logger } from "../config/logger";

/**
 * In-app notifications (the bell). Creating one never throws into the caller:
 * a notification is a side effect of a booking or a certificate, and must not
 * break it. A `dedupeKey` makes it fire once per user.
 */

export type NotificationType =
  | "session_booked"
  | "session_cancelled"
  | "session_reminder"
  | "certificate"
  | "event_new"
  | "event_recording"
  | "course_nudge";

export interface NewNotification {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
}

/** Notifies one or more users. Returns how many were actually created (duplicates skipped). */
export async function notify(userIds: string | string[], n: NewNotification): Promise<number> {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
  if (!ids.length) return 0;
  try {
    const rows = await db
      .insert(notifications)
      .values(
        ids.map((userId) => ({
          userId,
          type: n.type,
          title: n.title,
          body: n.body ?? null,
          link: n.link ?? null,
          dedupeKey: n.dedupeKey ?? null,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    return rows.length;
  } catch (err) {
    logger.error({ err, type: n.type }, "Could not create notification");
    return 0;
  }
}

/** Notifies every learner (role sme). */
export async function notifyAllLearners(n: NewNotification): Promise<number> {
  try {
    const learners = await db.select({ id: users.id }).from(users).where(eq(users.role, "sme"));
    return notify(learners.map((l) => l.id), n);
  } catch (err) {
    logger.error({ err, type: n.type }, "Could not list learners to notify");
    return 0;
  }
}

/** The user's latest notifications and how many are unread. */
export async function listNotifications(userId: string, limit = 30): Promise<{ items: Notification[]; unread: number }> {
  const [items, unread] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    unreadCount(userId),
  ]);
  return { items, unread };
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.unread ?? 0;
}

/** Marks one of the user's own notifications read; false if it isn't theirs. */
export async function markRead(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

const LABEL: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/** "Mon 5 Oct, 10:00" in the user's timezone (UAE time when unknown or invalid). */
export function whenLabel(d: Date, timezone?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { ...LABEL, timeZone: timezone || "Asia/Dubai" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...LABEL, timeZone: "Asia/Dubai" }).format(d);
  }
}
