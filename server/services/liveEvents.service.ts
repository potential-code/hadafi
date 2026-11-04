import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { liveEvents, type InsertLiveEvent } from '../db/schema'
import { AppError } from '../utils/app-error'
import { notifyAllLearners } from './notifications.service'

/** Today as 'YYYY-MM-DD' in UAE time (events are dated in UAE time). */
function todayInUae(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())
}

/** '5 Oct 2026, 5:00 PM / GST' from an event's date and display time. */
function eventWhen(e: typeof liveEvents.$inferSelect): string {
  const d = new Date(`${e.date}T12:00:00Z`)
  const day = Number.isNaN(d.getTime())
    ? e.date
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d)
  return e.time ? `${day}, ${e.time}` : day
}

/**
 * Tells every learner when an upcoming event is first published, and when a
 * published event gets its recording. Dedupe keys make each fire once.
 */
function announce(before: typeof liveEvents.$inferSelect | null, after: typeof liveEvents.$inferSelect): void {
  if (after.status !== 'published') return
  if (before?.status !== 'published' && after.date >= todayInUae()) {
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

/**
 * Returns all published live events ordered by date descending.
 * Used by the public-facing SME dashboard route.
 */
export async function listPublishedEvents(): Promise<typeof liveEvents.$inferSelect[]> {
  return db.select().from(liveEvents).where(eq(liveEvents.status, 'published')).orderBy(desc(liveEvents.date))
}

/**
 * Returns every live event (all statuses) ordered by date descending.
 * Used by the admin management route.
 */
export async function listAllEvents(): Promise<typeof liveEvents.$inferSelect[]> {
  return db.select().from(liveEvents).orderBy(desc(liveEvents.date))
}

/**
 * Fetches a single live event by its UUID.
 * Returns null when no matching row exists.
 *
 * @param id - UUID of the live event
 */
export async function getEvent(id: string): Promise<typeof liveEvents.$inferSelect | null> {
  const [event] = await db
    .select()
    .from(liveEvents)
    .where(eq(liveEvents.id, id))
    .limit(1)
  return event ?? null
}

/**
 * Inserts a new live event and returns the created row.
 * Throws INSERT_FAILED (500) when the DB returns no row (should not happen in practice).
 *
 * @param createdBy - UUID of the admin user creating the event
 * @param data      - Event fields (id, createdAt, updatedAt, and createdBy are excluded)
 */
export async function createEvent(
  createdBy: string,
  data: Omit<InsertLiveEvent, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
): Promise<typeof liveEvents.$inferSelect> {
  const [event] = await db
    .insert(liveEvents)
    .values({ ...data, createdBy })
    .returning()
  if (!event) throw new AppError('Failed to create event', 500, 'INSERT_FAILED')
  announce(null, event)
  return event
}

/**
 * Updates an existing live event and returns the updated row.
 * Throws NOT_FOUND (404) when no event with the given id exists.
 *
 * @param id   - UUID of the live event to update
 * @param data - Partial event fields to apply (id, createdAt, createdBy are excluded)
 */
export async function updateEvent(
  id: string,
  data: Partial<Omit<InsertLiveEvent, 'id' | 'createdAt' | 'createdBy'>>,
): Promise<typeof liveEvents.$inferSelect> {
  const existing = await getEvent(id)
  if (!existing) throw new AppError('Event not found', 404, 'NOT_FOUND')

  const [updated] = await db
    .update(liveEvents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(liveEvents.id, id))
    .returning()

  // updated is guaranteed to exist here because we confirmed the row above
  announce(existing, updated!)
  return updated!
}

/**
 * Deletes a live event by its UUID.
 * Throws NOT_FOUND (404) when no event with the given id exists.
 *
 * @param id - UUID of the live event to delete
 */
export async function deleteEvent(id: string): Promise<void> {
  const existing = await getEvent(id)
  if (!existing) throw new AppError('Event not found', 404, 'NOT_FOUND')
  await db.delete(liveEvents).where(eq(liveEvents.id, id))
}
