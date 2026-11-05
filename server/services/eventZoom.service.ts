import { and, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { eventAttendance, eventRsvps, liveEvents, users, type EventRsvp, type LiveEvent } from "../db/schema";
import { logger } from "../config/logger";
import { zoom, ZoomError, zoomErrorSummary, type ZoomSession } from "./zoom";

/**
 * Keeping Hadafi's Zoom events and Zoom in step (after SAMA): the meeting for
 * each Zoom event, a registrant (personal join link) for each booking, and
 * attendance read back from Zoom's report afterwards.
 *
 * Zoom failing never blocks saving an event or booking a place: the result is
 * written to the row's zoom status, and the reminder sweep (every 15 minutes)
 * tries again.
 */

function notConfigured(): ZoomError {
  return new ZoomError("not_configured", "Zoom credentials are not set.");
}

const durationOf = (e: LiveEvent) => Math.max(1, Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000));

async function markEvent(id: string, patch: Partial<typeof liveEvents.$inferInsert>) {
  await db.update(liveEvents).set({ ...patch, zoomSyncedAt: new Date() }).where(eq(liveEvents.id, id));
}

/** Clears every booking's Zoom link (the meeting is gone or was never Zoom). */
async function clearRegistrants(eventId: string) {
  await db
    .update(eventRsvps)
    .set({ zoomRegistrantId: null, zoomJoinUrl: null, zoomStatus: "not_required", zoomError: null })
    .where(eq(eventRsvps.eventId, eventId));
}

/**
 * Makes Zoom match the event: creates or updates the meeting for a Zoom event,
 * or removes the meeting when the event stopped being one. Never throws.
 */
export async function syncEventMeeting(eventId: string): Promise<void> {
  const [event] = await db.select().from(liveEvents).where(eq(liveEvents.id, eventId));
  if (!event) return;

  if (event.format !== "zoom") {
    if (event.zoomMeetingId) {
      try {
        await zoom?.deleteMeeting(event.zoomMeetingId);
      } catch (err) {
        if (!(err instanceof ZoomError && err.kind === "not_found")) logger.error({ err }, "[zoom] could not delete meeting");
      }
    }
    if (event.zoomMeetingId || event.zoomStatus !== "not_required") {
      await markEvent(event.id, { zoomMeetingId: null, zoomJoinUrl: null, zoomPasscode: null, zoomStatus: "not_required", zoomError: null });
      await clearRegistrants(event.id);
    }
    return;
  }

  // A finished event's meeting is left alone.
  if (event.endsAt.getTime() < Date.now()) return;

  try {
    if (!zoom) throw notConfigured();
    const input = { topic: event.title, agenda: event.description, startsAt: event.startsAt, timezone: event.timezone, durationMinutes: durationOf(event) };
    if (event.zoomMeetingId) {
      await zoom.updateMeeting(event.zoomMeetingId, input);
      await markEvent(event.id, { zoomStatus: "active", zoomError: null });
    } else {
      const meeting = await zoom.createMeeting(input);
      await markEvent(event.id, {
        zoomMeetingId: meeting.meetingId,
        zoomJoinUrl: meeting.joinUrl,
        zoomPasscode: meeting.passcode,
        zoomStatus: "active",
        zoomError: null,
      });
    }
    // Anyone who booked before the meeting existed (or while Zoom was down).
    await registerPending(event.id);
  } catch (err) {
    // The meeting was deleted in Zoom: start again with a new one next time.
    if (err instanceof ZoomError && err.kind === "not_found" && event.zoomMeetingId) {
      await markEvent(event.id, { zoomMeetingId: null, zoomJoinUrl: null, zoomPasscode: null, zoomStatus: "pending", zoomError: zoomErrorSummary(err) });
      await clearRegistrants(event.id);
      return;
    }
    logger.error({ id: event.id, err: err instanceof ZoomError ? err.kind : err }, "[zoom] meeting sync failed");
    await markEvent(event.id, { zoomStatus: "failed", zoomError: zoomErrorSummary(err) });
  }
}

async function registerPending(eventId: string) {
  const pending = await db
    .select({ id: eventRsvps.id })
    .from(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), inArray(eventRsvps.zoomStatus, ["not_required", "pending", "failed"])));
  for (const r of pending) await syncRegistrant(r.id);
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  const firstName = (parts[0] ?? "Learner").slice(0, 60);
  const lastName = (parts.slice(1).join(" ") || "-").slice(0, 60);
  return { firstName, lastName };
}

/** Registers one booking with Zoom so the learner gets her own join link. Never throws. */
export async function syncRegistrant(rsvpId: string): Promise<EventRsvp | null> {
  const [row] = await db
    .select({ rsvp: eventRsvps, event: liveEvents, email: users.email, fullName: users.fullName })
    .from(eventRsvps)
    .innerJoin(liveEvents, eq(liveEvents.id, eventRsvps.eventId))
    .innerJoin(users, eq(users.id, eventRsvps.userId))
    .where(eq(eventRsvps.id, rsvpId));
  if (!row) return null;
  const { rsvp, event } = row;
  if (event.format !== "zoom" || rsvp.zoomStatus === "active") return rsvp;

  // Waiting for the meeting itself; registerPending runs once it exists.
  if (!event.zoomMeetingId || event.zoomStatus !== "active") {
    const [updated] = await db.update(eventRsvps).set({ zoomStatus: "pending", zoomError: null }).where(eq(eventRsvps.id, rsvp.id)).returning();
    return updated ?? rsvp;
  }
  try {
    if (!zoom) throw notConfigured();
    const reg = await zoom.addRegistrant(event.zoomMeetingId, { email: row.email, ...splitName(row.fullName) });
    const [updated] = await db
      .update(eventRsvps)
      .set({ zoomRegistrantId: reg.registrantId, zoomJoinUrl: reg.joinUrl, zoomStatus: "active", zoomError: null })
      .where(eq(eventRsvps.id, rsvp.id))
      .returning();
    return updated ?? rsvp;
  } catch (err) {
    logger.error({ id: rsvp.id, err: err instanceof ZoomError ? err.kind : err }, "[zoom] registrant sync failed");
    const [updated] = await db
      .update(eventRsvps)
      .set({ zoomStatus: "failed", zoomError: zoomErrorSummary(err) })
      .where(eq(eventRsvps.id, rsvp.id))
      .returning();
    return updated ?? rsvp;
  }
}

/** Tells Zoom a booking was cancelled. Best effort: the booking is removed either way. */
export async function cancelRegistrant(event: LiveEvent, rsvp: EventRsvp, email: string): Promise<void> {
  if (!event.zoomMeetingId || !rsvp.zoomRegistrantId || !zoom) return;
  try {
    await zoom.cancelRegistrant(event.zoomMeetingId, { registrantId: rsvp.zoomRegistrantId, email });
  } catch (err) {
    logger.error({ id: rsvp.id, err: err instanceof ZoomError ? err.kind : err }, "[zoom] registrant cancel failed");
  }
}

/** Removes the meeting of an event being deleted. Best effort. */
export async function removeEventMeeting(event: LiveEvent): Promise<void> {
  if (!event.zoomMeetingId || !zoom || event.endsAt.getTime() < Date.now()) return;
  try {
    await zoom.deleteMeeting(event.zoomMeetingId);
  } catch (err) {
    if (!(err instanceof ZoomError && err.kind === "not_found")) logger.error({ err }, "[zoom] could not delete meeting");
  }
}

/** The host's start link, fetched fresh (never stored). */
export async function hostStartUrl(event: LiveEvent): Promise<string> {
  if (!zoom) throw notConfigured();
  if (!event.zoomMeetingId) throw new ZoomError("not_found", "This event has no Zoom meeting yet.");
  return zoom.getStartUrl(event.zoomMeetingId);
}

/** The sweep: upcoming Zoom events or bookings that didn't sync, tried again. */
export async function reconcileZoom(): Promise<{ meetings: number; registrants: number }> {
  if (!zoom) return { meetings: 0, registrants: 0 };
  const events = await db
    .select({ id: liveEvents.id })
    .from(liveEvents)
    .where(and(eq(liveEvents.format, "zoom"), gt(liveEvents.endsAt, new Date()), inArray(liveEvents.zoomStatus, ["not_required", "pending", "failed"])))
    .limit(25);
  for (const e of events) await syncEventMeeting(e.id);

  const rsvps = await db
    .select({ id: eventRsvps.id })
    .from(eventRsvps)
    .innerJoin(liveEvents, eq(liveEvents.id, eventRsvps.eventId))
    .where(
      and(
        eq(liveEvents.format, "zoom"),
        eq(liveEvents.zoomStatus, "active"),
        gt(liveEvents.endsAt, new Date()),
        inArray(eventRsvps.zoomStatus, ["not_required", "pending", "failed"]),
      ),
    )
    .limit(100);
  for (const r of rsvps) await syncRegistrant(r.id);
  return { meetings: events.length, registrants: rsvps.length };
}

/**
 * One row per person: every join added up, matched to a booking by her
 * registrant id (her personal link), else her email. Exported for tests.
 */
export function groupSessions(sessions: ZoomSession[], bookings: { userId: string; registrantId: string | null; email: string }[]) {
  const byRegistrant = new Map(bookings.filter((b) => b.registrantId).map((b) => [b.registrantId!, b.userId]));
  const byEmail = new Map(bookings.map((b) => [b.email.toLowerCase(), b.userId]));
  const people = new Map<string, { userId: string | null; name: string; email: string | null; first: Date; last: Date | null; seconds: number }>();
  for (const s of sessions) {
    const key = s.registrantId ? `r:${s.registrantId}` : s.email ? `e:${s.email}` : `n:${s.name.toLowerCase()}`;
    const userId = (s.registrantId && byRegistrant.get(s.registrantId)) || (s.email && byEmail.get(s.email)) || null;
    const p = people.get(key);
    if (!p) {
      people.set(key, { userId, name: s.name, email: s.email, first: s.joinedAt, last: s.leftAt, seconds: s.durationSeconds });
    } else {
      p.seconds += s.durationSeconds;
      if (s.joinedAt < p.first) p.first = s.joinedAt;
      if (s.leftAt && (!p.last || s.leftAt > p.last)) p.last = s.leftAt;
      p.userId ??= userId;
    }
  }
  return [...people.entries()].map(([matchKey, p]) => ({
    matchKey,
    userId: p.userId,
    name: p.name,
    email: p.email,
    firstJoinedAt: p.first,
    lastLeftAt: p.last,
    minutes: Math.round(p.seconds / 60),
  }));
}

/** Reads one finished event's attendance from Zoom. False while the report isn't ready. */
export async function syncAttendance(eventId: string): Promise<boolean> {
  const [event] = await db.select().from(liveEvents).where(eq(liveEvents.id, eventId));
  if (!event?.zoomMeetingId || !zoom) return false;
  let sessions: ZoomSession[];
  try {
    sessions = await zoom.listReportParticipants(event.zoomLastMeetingUuid ?? event.zoomMeetingId);
  } catch (err) {
    if (err instanceof ZoomError && err.kind === "not_found") return false;
    logger.error({ id: eventId, err: err instanceof ZoomError ? err.kind : err }, "[zoom] attendance report failed");
    return false;
  }
  const bookings = await db
    .select({ userId: eventRsvps.userId, registrantId: eventRsvps.zoomRegistrantId, email: users.email })
    .from(eventRsvps)
    .innerJoin(users, eq(users.id, eventRsvps.userId))
    .where(eq(eventRsvps.eventId, eventId));
  const rows = groupSessions(sessions, bookings);
  await db.transaction(async (tx) => {
    await tx.delete(eventAttendance).where(eq(eventAttendance.eventId, eventId));
    if (rows.length) await tx.insert(eventAttendance).values(rows.map((r) => ({ ...r, eventId })));
    await tx.update(liveEvents).set({ attendanceSyncedAt: new Date() }).where(eq(liveEvents.id, eventId));
  });
  return true;
}

/**
 * The sweep for attendance: Zoom events that ended at least 15 minutes ago
 * (Zoom needs a while to build the report), in the last week, not read yet.
 */
export async function reconcileAttendance(): Promise<number> {
  if (!zoom) return 0;
  const due = await db
    .select({ id: liveEvents.id })
    .from(liveEvents)
    .where(
      and(
        eq(liveEvents.format, "zoom"),
        isNotNull(liveEvents.zoomMeetingId),
        isNull(liveEvents.attendanceSyncedAt),
        lt(sql`coalesce(${liveEvents.zoomEndedAt}, ${liveEvents.endsAt})`, sql`now() - interval '15 minutes'`),
        gt(liveEvents.endsAt, sql`now() - interval '7 days'`),
      ),
    )
    .limit(10);
  let done = 0;
  for (const e of due) if (await syncAttendance(e.id)) done++;
  return done;
}
