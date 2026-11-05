import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { db } from '../db'
import { eventAttendance, eventRsvps, liveEvents, users, type EventRsvp, type LiveEvent } from '../db/schema'
import { AppError } from '../utils/app-error'
import { sendMail } from '../mail/mailer'
import { logger } from '../config/logger'
import { notify, notifyAllLearners, whenLabel } from './notifications.service'
import { cancelRegistrant, removeEventMeeting, syncEventMeeting, syncRegistrant } from './eventZoom.service'
import { zoomInfo } from './zoom'
import { writeTable, type ExportFormat, type Table } from './admin.exports.service'
import { DEFAULT_TIMEZONE, displayCopies, instantToZoned, isValidTimezone, legacyStart, zonedToInstant } from './eventTimes'

/**
 * Live events (port of SMEEP e1cec80): real start and end times in the zone
 * the admin picked, where they happen (a Zoom meeting Hadafi creates, another
 * link, or a place), bookings with an optional number of places, and what
 * each viewer may see.
 *
 * A way in (meeting link, Zoom meeting ID and passcode) only ever reaches a
 * learner who booked, and only from JOIN_OPENS_MINUTES before the start until
 * the event ends. For Zoom it's her own personal link. Nobody but an admin
 * sees who else booked.
 */

export type EventFormat = 'zoom' | 'link' | 'in_person'

export interface EventInput {
  title: string
  description?: string | null
  type?: string
  /** Day and wall-clock start in `timezone`: preferred. */
  startDate?: string
  startTime?: string
  timezone?: string
  /** Or an ISO instant with its offset (SMEEP's API). */
  startsAt?: string
  /** Or Hadafi's old date and free-text time. */
  date?: string
  time?: string
  durationMinutes?: number
  capacity?: number | null
  format?: EventFormat
  meetingLink?: string | null
  location?: string | null
  recordingLink?: string | null
  coverImage?: string | null
  status?: 'draft' | 'published'
}

/** The way in shows up this long before the start (the 1-hour reminder carries it). */
export const JOIN_OPENS_MINUTES = 60

const eventWhen = (e: Pick<LiveEvent, 'startsAt' | 'timezone'>, timezone?: string | null) => whenLabel(e.startsAt, timezone || e.timezone)

/** Booking emails are off unless REMINDER_EMAILS_ENABLED is exactly "true" (client sign-off). */
const emailsOn = () => process.env['REMINDER_EMAILS_ENABLED'] === 'true'

/** What the booking email is sent with (swapped in tests). */
export const eventDeps = { sendMail }

/** True while a booked learner may see how to join. */
export function joinOpen(e: Pick<LiveEvent, 'startsAt' | 'endsAt' | 'zoomStartedAt' | 'zoomEndedAt'>, now = Date.now()): boolean {
  if (e.zoomEndedAt) return false
  if (e.zoomStartedAt) return true
  return now >= e.startsAt.getTime() - JOIN_OPENS_MINUTES * 60_000 && now < e.endsAt.getTime()
}

// ── Views ────────────────────────────────────────────────────────────────────

/** What anyone may see (the homepage, signed out): no links, no bookings. */
export function publicView(e: LiveEvent) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    type: e.type,
    date: e.date,
    time: e.time,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    timezone: e.timezone,
    format: e.format as EventFormat,
    location: e.format === 'in_person' ? e.location : null,
    recordingLink: e.recordingLink,
    coverImage: e.coverImage,
    status: e.status,
    capacity: e.capacity,
    /** From Zoom's webhooks: it's on now / it has finished. */
    startedAt: e.zoomStartedAt?.toISOString() ?? null,
    endedAt: e.zoomEndedAt?.toISOString() ?? null,
    // Kept for older readers: never a real link here.
    meetingLink: null as string | null,
  }
}

/** A learner's view: her own booking, the places left, and how to join once it's near. */
export function learnerView(e: LiveEvent, rsvp: EventRsvp | null, bookings: number, now = Date.now()) {
  const booked = !!rsvp
  const open = booked && joinOpen(e, now)
  const join = !open ? null : e.format === 'zoom' ? rsvp!.zoomJoinUrl : e.format === 'link' ? e.meetingLink : null
  return {
    ...publicView(e),
    meetingLink: join,
    booked,
    bookedAt: rsvp?.createdAt.toISOString() ?? null,
    /** Null when there's no limit; never who booked. */
    spotsLeft: e.capacity == null ? null : Math.max(0, e.capacity - bookings),
    full: e.capacity != null && bookings >= e.capacity,
    /** When the join link appears for her (booked, online events). */
    joinOpensAt: booked && e.format !== 'in_person' ? new Date(e.startsAt.getTime() - JOIN_OPENS_MINUTES * 60_000).toISOString() : null,
    /** Zoom: her personal link isn't ready yet (Zoom is being slow or down). */
    joinPending: open && e.format === 'zoom' && !rsvp?.zoomJoinUrl,
    meetingId: open && e.format === 'zoom' ? e.zoomMeetingId : null,
    passcode: open && e.format === 'zoom' ? e.zoomPasscode : null,
  }
}

export type AdminEventView = ReturnType<typeof adminView>

/** Admins: everything except the host start link (fetched on demand). */
function adminView(e: LiveEvent, bookings: number, attended: number) {
  const local = instantToZoned(e.startsAt, e.timezone)
  return {
    ...publicView(e),
    meetingLink: e.meetingLink,
    location: e.location,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    durationMinutes: Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000),
    /** The start as the admin entered it, in the event's zone. */
    startDate: local.day,
    startTime: local.time,
    legacyTime: e.legacyTime,
    timeNeedsReview: e.timeNeedsReview,
    bookings,
    attended,
    zoom: {
      status: e.zoomStatus,
      error: e.zoomError,
      meetingId: e.zoomMeetingId,
      passcode: e.zoomPasscode,
      joinUrl: e.zoomJoinUrl,
      syncedAt: e.zoomSyncedAt?.toISOString() ?? null,
      attendanceSyncedAt: e.attendanceSyncedAt?.toISOString() ?? null,
    },
  }
}

async function bookingCounts(): Promise<Map<string, number>> {
  const rows = await db.select({ eventId: eventRsvps.eventId, n: sql<number>`count(*)::int` }).from(eventRsvps).groupBy(eventRsvps.eventId)
  return new Map(rows.map((r) => [r.eventId, r.n]))
}

async function bookingCount(eventId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(eventRsvps).where(eq(eventRsvps.eventId, eventId))
  return row?.n ?? 0
}

// ── Lists ────────────────────────────────────────────────────────────────────

export async function listPublishedEvents() {
  const rows = await db.select().from(liveEvents).where(eq(liveEvents.status, 'published')).orderBy(desc(liveEvents.startsAt))
  return rows.map(publicView)
}

export async function listForLearner(userId: string) {
  const [rows, mine, counts] = await Promise.all([
    db.select().from(liveEvents).where(eq(liveEvents.status, 'published')).orderBy(desc(liveEvents.startsAt)),
    db.select().from(eventRsvps).where(eq(eventRsvps.userId, userId)),
    bookingCounts(),
  ])
  const byEvent = new Map(mine.map((r) => [r.eventId, r]))
  const now = Date.now()
  return rows.map((e) => learnerView(e, byEvent.get(e.id) ?? null, counts.get(e.id) ?? 0, now))
}

export async function listAllEvents() {
  const [rows, counts, attendance] = await Promise.all([
    db.select().from(liveEvents).orderBy(desc(liveEvents.startsAt)),
    bookingCounts(),
    db.select({ eventId: eventAttendance.eventId, n: sql<number>`count(*)::int` }).from(eventAttendance).groupBy(eventAttendance.eventId),
  ])
  const attended = new Map(attendance.map((r) => [r.eventId, r.n]))
  return rows.map((e) => adminView(e, counts.get(e.id) ?? 0, attended.get(e.id) ?? 0))
}

export async function getEvent(id: string): Promise<LiveEvent | null> {
  const [event] = await db.select().from(liveEvents).where(eq(liveEvents.id, id)).limit(1)
  return event ?? null
}

async function getAdminEvent(id: string) {
  const event = await getEvent(id)
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND')
  const [bookings, [att]] = await Promise.all([
    bookingCount(id),
    db.select({ n: sql<number>`count(*)::int` }).from(eventAttendance).where(eq(eventAttendance.eventId, id)),
  ])
  return adminView(event, bookings, att?.n ?? 0)
}

// ── Create / update / delete ─────────────────────────────────────────────────

/** The start an input asks for, or undefined when it doesn't touch the time. */
function startFrom(input: Partial<EventInput>, existing?: LiveEvent): { startsAt: Date; timezone: string; needsReview: boolean } | undefined {
  const tzGiven = input.timezone !== undefined
  const timezone = input.timezone ?? existing?.timezone ?? DEFAULT_TIMEZONE
  if (!isValidTimezone(timezone)) throw new AppError('Choose a valid time zone.', 422, 'INVALID_TIMEZONE')

  if (input.startDate !== undefined || input.startTime !== undefined || tzGiven) {
    // Day and time in the zone; anything missing comes from the saved event.
    const local = existing ? instantToZoned(existing.startsAt, existing.timezone) : null
    const day = input.startDate ?? local?.day
    const time = input.startTime ?? local?.time
    if (!day || !time) throw new AppError('Pick a day and a start time.', 422, 'START_REQUIRED')
    const startsAt = zonedToInstant(day, time, timezone)
    if (!startsAt) throw new AppError('That day or time does not exist.', 422, 'INVALID_START')
    return { startsAt, timezone, needsReview: false }
  }
  if (input.startsAt !== undefined) {
    const startsAt = new Date(input.startsAt)
    if (Number.isNaN(startsAt.getTime())) throw new AppError('That start time is not valid.', 422, 'INVALID_START')
    return { startsAt, timezone, needsReview: false }
  }
  if (input.date !== undefined || input.time !== undefined) {
    const date = input.date ?? existing?.date
    const time = input.time ?? existing?.legacyTime ?? existing?.time
    if (!date) throw new AppError('Pick a day and a start time.', 422, 'START_REQUIRED')
    const parsed = legacyStart(date, time)
    if (!parsed) throw new AppError('That date does not exist.', 422, 'INVALID_START')
    return { startsAt: parsed.startsAt, timezone: DEFAULT_TIMEZONE, needsReview: parsed.needsReview }
  }
  return undefined
}

function rowFrom(input: Partial<EventInput>, existing?: LiveEvent): Partial<typeof liveEvents.$inferInsert> {
  const row: Partial<typeof liveEvents.$inferInsert> = {}
  if (input.title !== undefined) row.title = input.title
  if (input.description !== undefined) row.description = input.description || null
  if (input.type !== undefined) row.type = input.type
  if (input.recordingLink !== undefined) row.recordingLink = input.recordingLink || null
  if (input.coverImage !== undefined) row.coverImage = input.coverImage || null
  if (input.status !== undefined) row.status = input.status
  if (input.format !== undefined) row.format = input.format
  if (input.meetingLink !== undefined) row.meetingLink = input.meetingLink || null
  if (input.location !== undefined) row.location = input.location || null
  if (input.capacity !== undefined) row.capacity = input.capacity ?? null

  const start = startFrom(input, existing)
  if (start || (existing && input.durationMinutes !== undefined)) {
    const startsAt = start?.startsAt ?? existing!.startsAt
    const timezone = start?.timezone ?? existing!.timezone
    const minutes = input.durationMinutes ?? (existing ? Math.round((existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000) : 60)
    row.startsAt = startsAt
    row.endsAt = new Date(startsAt.getTime() + minutes * 60_000)
    row.timezone = timezone
    if (start) {
      row.timeNeedsReview = start.needsReview
      // A legacy write keeps the admin's own text; otherwise the display copies follow the real time.
      if (input.date !== undefined || input.time !== undefined) {
        row.date = input.date ?? existing!.date
        row.time = input.time ?? existing!.time
        row.legacyTime = row.time
      } else {
        Object.assign(row, displayCopies(startsAt, timezone))
      }
    }
  }
  return row
}

function assertWhere(e: Pick<LiveEvent, 'format' | 'meetingLink' | 'location'>) {
  if (e.format === 'zoom' && !zoomInfo().configured) {
    throw new AppError("Zoom isn't connected on this server yet. Choose another link, or add the Zoom credentials.", 422, 'ZOOM_NOT_CONFIGURED')
  }
  if (e.format === 'in_person' && !e.location?.trim()) throw new AppError('Add where the event takes place.', 422, 'LOCATION_REQUIRED')
}

/** Learners hear about a published event that's still ahead, and about a new recording. */
function announce(before: LiveEvent | null, after: LiveEvent) {
  if (after.status !== 'published') return
  if (after.endsAt.getTime() > Date.now() && before?.status !== 'published') {
    void notifyAllLearners({
      type: 'event_new',
      title: `New event: ${after.title}`,
      body: eventWhen(after),
      link: '/dashboard/events',
      dedupeKey: `event:${after.id}:new`,
    })
  }
  // Learners first see the replay when the event is published with it, or when it's added later.
  const hadReplay = before?.status === 'published' && !!before.recordingLink
  if (after.recordingLink && !hadReplay) {
    void notifyAllLearners({
      type: 'event_recording',
      title: `Replay available: ${after.title}`,
      body: 'Watch the recording on the Events page.',
      link: '/dashboard/events',
      dedupeKey: `event:${after.id}:recording`,
    })
  }
}

async function bookedUserIds(eventId: string): Promise<string[]> {
  return (await db.select({ id: eventRsvps.userId }).from(eventRsvps).where(eq(eventRsvps.eventId, eventId))).map((r) => r.id)
}

/** Everyone who booked hears an event won't go ahead (deleted, or taken off the Events page). */
async function notifyCancelled(e: LiveEvent): Promise<void> {
  if (e.status !== 'published' || e.endsAt.getTime() <= Date.now()) return
  const ids = await bookedUserIds(e.id)
  if (!ids.length) return
  await notify(ids, {
    type: 'event_cancelled',
    title: `Cancelled: ${e.title}`,
    body: `The event on ${eventWhen(e)} won't go ahead.`,
    link: '/dashboard/events',
    dedupeKey: `event:${e.id}:cancelled:${e.startsAt.getTime()}`,
  })
}

export async function createEvent(createdBy: string, input: EventInput) {
  const row = rowFrom(input)
  if (!row.startsAt) throw new AppError('Pick a day and a start time.', 422, 'START_REQUIRED')
  row.format ??= 'link'
  assertWhere({ format: row.format, meetingLink: row.meetingLink ?? null, location: row.location ?? null })
  const [event] = await db
    .insert(liveEvents)
    .values({ ...(row as typeof liveEvents.$inferInsert), createdBy, zoomStatus: row.format === 'zoom' ? 'pending' : 'not_required' })
    .returning()
  if (!event) throw new AppError('Failed to create event', 500, 'INSERT_FAILED')
  if (event.format === 'zoom') await syncEventMeeting(event.id)
  announce(null, event)
  return getAdminEvent(event.id)
}

export async function updateEvent(id: string, input: Partial<EventInput>) {
  const existing = await getEvent(id)
  if (!existing) throw new AppError('Event not found', 404, 'NOT_FOUND')
  const row = rowFrom(input, existing)
  const next = { ...existing, ...row } as LiveEvent
  assertWhere(next)
  if (next.capacity != null && next.capacity < (await bookingCount(id))) {
    throw new AppError('More learners have already booked than that number of places.', 422, 'CAPACITY_BELOW_BOOKINGS')
  }

  const [updated] = await db
    .update(liveEvents)
    .set({ ...row, updatedAt: new Date(), ...(next.format === 'zoom' && existing.format !== 'zoom' ? { zoomStatus: 'pending' } : {}) })
    .where(eq(liveEvents.id, id))
    .returning()

  const moved = updated!.startsAt.getTime() !== existing.startsAt.getTime() || updated!.endsAt.getTime() !== existing.endsAt.getTime()
  const changedZoom = updated!.format === 'zoom' || existing.format === 'zoom'
  if (changedZoom && (moved || row.title !== undefined || row.description !== undefined || row.format !== undefined || row.timezone !== existing.timezone)) {
    await syncEventMeeting(id)
  }

  // Everyone who booked hears that it moved (and the reminders re-arm, keyed on the start).
  if (moved && updated!.status === 'published' && existing.status === 'published' && updated!.endsAt.getTime() > Date.now()) {
    const ids = await bookedUserIds(id)
    if (ids.length) {
      await notify(ids, {
        type: 'event_changed',
        title: `New time: ${updated!.title}`,
        body: `Now ${eventWhen(updated!)}.`,
        link: '/dashboard/events',
        dedupeKey: `event:${id}:moved:${updated!.startsAt.getTime()}:${updated!.endsAt.getTime()}`,
      })
    }
  }
  if (existing.status === 'published' && updated!.status === 'draft') await notifyCancelled(existing)
  announce(existing, updated!)
  return getAdminEvent(id)
}

export async function deleteEvent(id: string): Promise<void> {
  const existing = await getEvent(id)
  if (!existing) throw new AppError('Event not found', 404, 'NOT_FOUND')
  await notifyCancelled(existing)
  await removeEventMeeting(existing)
  await db.delete(liveEvents).where(eq(liveEvents.id, id))
}

/** Tries Zoom again for this event and its bookings (the admin's "Re-sync"). */
export async function resyncZoom(id: string) {
  const existing = await getEvent(id)
  if (!existing) throw new AppError('Event not found', 404, 'NOT_FOUND')
  if (existing.format !== 'zoom') throw new AppError("This event isn't a Zoom meeting.", 422, 'NOT_ZOOM')
  await syncEventMeeting(id)
  return getAdminEvent(id)
}

// ── Booking ──────────────────────────────────────────────────────────────────

export async function rsvp(userId: string, eventId: string) {
  // The event row is locked while the places are counted, so two learners
  // can't both take the last one.
  const result = await db.transaction(async (tx) => {
    const [event] = await tx.select().from(liveEvents).where(eq(liveEvents.id, eventId)).for('update')
    if (!event || event.status !== 'published') throw new AppError('Event not found', 404, 'NOT_FOUND')
    if (event.endsAt.getTime() <= Date.now() || event.zoomEndedAt) throw new AppError('This event has already finished.', 409, 'EVENT_ENDED')
    const [already] = await tx.select().from(eventRsvps).where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)))
    if (already) return { event, mine: already, created: false }
    if (event.capacity != null) {
      const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(eventRsvps).where(eq(eventRsvps.eventId, eventId))) as [{ n: number }]
      if (n >= event.capacity) throw new AppError('This event is full.', 409, 'EVENT_FULL')
    }
    const [created] = await tx
      .insert(eventRsvps)
      .values({ eventId, userId, zoomStatus: event.format === 'zoom' ? 'pending' : 'not_required' })
      .onConflictDoNothing()
      .returning()
    const mine = created ?? (await tx.select().from(eventRsvps).where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId))))[0]!
    return { event, mine, created: !!created }
  })
  const { event, created } = result
  let mine = result.mine
  if (event.format === 'zoom') mine = (await syncRegistrant(mine.id)) ?? mine

  if (created) {
    const [u] = await db.select({ email: users.email, name: users.fullName, timezone: users.timezone }).from(users).where(eq(users.id, userId))
    const minutesAway = (event.startsAt.getTime() - Date.now()) / 60_000
    const next =
      minutesAway > 24 * 60
        ? "We'll remind you the day before and an hour before."
        : minutesAway > 60
          ? "We'll remind you an hour before."
          : event.format === 'in_person'
            ? 'See you there.'
            : 'Your join link is on the Events page.'
    await notify(userId, {
      type: 'event_booked',
      title: `You're booked: ${event.title}`,
      body: `${eventWhen(event, u?.timezone)}. ${next}`,
      link: '/dashboard/events',
    })
    if (u && emailsOn()) {
      eventDeps
        .sendMail({
          to: u.email,
          subject: `You're booked: ${event.title}`,
          template: 'event-booked',
          context: { name: u.name, title: event.title, when: eventWhen(event, u.timezone), ...joinDetails(event, mine) },
        })
        .catch((err) => logger.error({ err }, 'Event booking email failed'))
    }
  }
  return learnerView(event, mine, await bookingCount(eventId))
}

export async function cancelRsvp(userId: string, eventId: string) {
  const event = await getEvent(eventId)
  // Drafts are hidden from learners: same answer as an unknown id.
  if (!event || event.status !== 'published') throw new AppError('Event not found', 404, 'NOT_FOUND')
  const [removed] = await db.delete(eventRsvps).where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId))).returning()
  if (removed?.zoomRegistrantId) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
    if (u) await cancelRegistrant(event, removed, u.email)
  }
  return learnerView(event, null, await bookingCount(eventId))
}

/**
 * What an email says about joining: her own Zoom link, the link, or the
 * place. Links only once joining is open (the 1-hour reminder), like the page.
 */
export function joinDetails(event: LiveEvent, rsvp: Pick<EventRsvp, 'zoomJoinUrl'> | null, now = Date.now()) {
  const open = joinOpen(event, now)
  if (event.format === 'zoom') {
    return {
      joinUrl: open ? (rsvp?.zoomJoinUrl ?? null) : null,
      meetingId: open ? event.zoomMeetingId : null,
      passcode: open ? event.zoomPasscode : null,
      personal: true,
      location: null,
    }
  }
  if (event.format === 'link') return { joinUrl: open ? event.meetingLink : null, meetingId: null, passcode: null, personal: false, location: null }
  return { joinUrl: null, meetingId: null, passcode: null, personal: false, location: event.location }
}

// ── Admin: who booked and who came ───────────────────────────────────────────

export interface Booking {
  userId: string
  fullName: string
  email: string
  company: string | null
  bookedAt: string
  zoomStatus: string
  attendedMinutes: number | null
}

export async function listBookings(eventId: string): Promise<{ bookings: Booking[]; guests: { name: string; email: string | null; minutes: number }[] }> {
  const event = await getEvent(eventId)
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND')
  const [rows, attendance] = await Promise.all([
    db
      .select({ userId: users.id, fullName: users.fullName, email: users.email, company: users.company, bookedAt: eventRsvps.createdAt, zoomStatus: eventRsvps.zoomStatus })
      .from(eventRsvps)
      .innerJoin(users, eq(users.id, eventRsvps.userId))
      .where(eq(eventRsvps.eventId, eventId))
      .orderBy(eventRsvps.createdAt),
    db.select().from(eventAttendance).where(eq(eventAttendance.eventId, eventId)),
  ])
  const minutesByUser = new Map(attendance.filter((a) => a.userId).map((a) => [a.userId!, a.minutes]))
  const read = !!event.attendanceSyncedAt
  const bookedIds = new Set(rows.map((r) => r.userId))
  return {
    bookings: rows.map((r) => ({
      ...r,
      bookedAt: r.bookedAt.toISOString(),
      attendedMinutes: read ? (minutesByUser.get(r.userId) ?? 0) : null,
    })),
    // People in the meeting who hadn't booked (e.g. the host, a guest speaker).
    guests: attendance.filter((a) => !a.userId || !bookedIds.has(a.userId)).map((a) => ({ name: a.name, email: a.email, minutes: a.minutes })),
  }
}

export async function exportBookings(eventId: string, format: ExportFormat) {
  const event = await getEvent(eventId)
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND')
  const { bookings } = await listBookings(eventId)
  const table: Table = {
    title: 'Bookings',
    columns: [
      { key: 'name', label: 'Name', width: 26 },
      { key: 'email', label: 'Email', width: 32 },
      { key: 'company', label: 'Company', width: 24 },
      { key: 'booked', label: 'Booked', width: 18, time: true },
      { key: 'attended', label: 'Minutes attended' },
    ],
    rows: bookings.map((b) => ({ name: b.fullName, email: b.email, company: b.company, booked: new Date(b.bookedAt), attended: b.attendedMinutes })),
  }
  const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event'
  return writeTable(table, format, `${slug}-bookings`)
}

/** Booked learners for published events starting in the next 24 hours (for reminders). */
export async function upcomingBookings(now = new Date()) {
  return db
    .select({ event: liveEvents, rsvp: eventRsvps, email: users.email, name: users.fullName, timezone: users.timezone })
    .from(eventRsvps)
    .innerJoin(liveEvents, eq(liveEvents.id, eventRsvps.eventId))
    .innerJoin(users, eq(users.id, eventRsvps.userId))
    .where(and(eq(liveEvents.status, 'published'), gt(liveEvents.startsAt, now), sql`${liveEvents.startsAt} <= ${new Date(now.getTime() + 24 * 3_600_000)}`))
}
