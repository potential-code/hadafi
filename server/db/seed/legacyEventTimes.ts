import { legacyStart } from '../../services/eventTimes.ts'

/**
 * The real start and end (an hour) for a seeded event with an old-style date
 * and free-text time, read the same way the event_times migration reads them.
 * The text itself is kept in `time` and `legacyTime`.
 */
export function legacyTimes(date: string, time: string) {
  const parsed = legacyStart(date, time)
  const startsAt = parsed?.startsAt ?? new Date(`${date}T08:00:00Z`)
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60_000),
    legacyTime: time,
    timeNeedsReview: parsed ? parsed.needsReview : true,
  }
}
