import { eq, sql, desc } from 'drizzle-orm'

import { db } from '../db'
import { learnerActivityDays, users } from '../db/schema'
import { logger } from '../config/logger'

/** Steps a learner needs in a day to meet the daily goal. Fixed for now. */
export const DAILY_GOAL = 1

export type StreakDay = { date: string; done: boolean }
export type Streak = {
  currentStreak: number
  longestStreak: number
  todaySteps: number
  dailyGoal: number
  week: StreakDay[]
}

const ONE_DAY_MS = 86_400_000

/** Returns `tz` when it is a valid IANA timezone, else 'UTC'. */
function safeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

/** YYYY-MM-DD of `at` as seen in timezone `zone`. */
function dayIn(zone: string, at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Calendar arithmetic on YYYY-MM-DD strings (timezone-free, via UTC noon-less dates). */
function addDays(day: string, n: number): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
  return new Date(t + n * ONE_DAY_MS).toISOString().slice(0, 10)
}

function dayIndex(day: string): number {
  return Math.round(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / ONE_DAY_MS)
}

async function zoneOf(userId: string): Promise<string> {
  const [row] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1)
  return safeZone(row?.timezone)
}

/**
 * Records one completed learning step for today (in the learner's timezone).
 *
 * Called from every progress path: course block completion, direct unit
 * completion and assessment submits.
 * Fail-open: a streak write must never break the progress write that
 * triggered it, so errors are logged and swallowed.
 *
 * @param userId - Learner UUID.
 * @param steps  - Number of steps to add (default 1).
 */
export async function recordLearningStep(userId: string, steps = 1): Promise<void> {
  if (steps <= 0) return
  try {
    const day = dayIn(await zoneOf(userId))
    await db
      .insert(learnerActivityDays)
      .values({ userId, day, steps })
      .onConflictDoUpdate({
        target: [learnerActivityDays.userId, learnerActivityDays.day],
        set: { steps: sql`${learnerActivityDays.steps} + ${steps}` },
      })
    // Badges for steps, streaks and exam scores. Imported here because
    // achievements.service imports this file for getStreak.
    void import('./achievements.service').then((m) => m.checkBadges(userId))
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to record learning step for streak')
  }
}

/**
 * Computes the learner's streak and daily-goal state.
 *
 * - currentStreak: consecutive active days ending today, or ending yesterday
 *   when nothing has been done yet today (the streak is still alive).
 * - longestStreak: longest run of consecutive active days ever.
 * - week: Monday to Sunday of the current week in the learner's timezone.
 *
 * @param userId - Learner UUID.
 */
export async function getStreak(userId: string): Promise<Streak> {
  const zone = await zoneOf(userId)
  const today = dayIn(zone)

  const rows = await db
    .select({ day: learnerActivityDays.day, steps: learnerActivityDays.steps })
    .from(learnerActivityDays)
    .where(eq(learnerActivityDays.userId, userId))
    .orderBy(desc(learnerActivityDays.day))

  const active = new Set(rows.filter((r) => r.steps > 0).map((r) => r.day))
  const todaySteps = rows.find((r) => r.day === today)?.steps ?? 0

  // Current streak: walk back from today (or yesterday if today is empty).
  let currentStreak = 0
  let cursor = active.has(today) ? today : addDays(today, -1)
  while (active.has(cursor)) {
    currentStreak += 1
    cursor = addDays(cursor, -1)
  }

  // Longest streak: scan active days in ascending order.
  const sorted = [...active].map(dayIndex).sort((a, b) => a - b)
  let longestStreak = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1]! + 1 ? run + 1 : 1
    if (run > longestStreak) longestStreak = run
  }

  // Week: Monday..Sunday containing today. getUTCDay on the date-only value
  // gives the weekday of that calendar date (0 = Sunday).
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  const monday = addDays(today, -((weekday + 6) % 7))
  const week: StreakDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return { date, done: active.has(date) }
  })

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    todaySteps,
    dailyGoal: DAILY_GOAL,
    week,
  }
}
