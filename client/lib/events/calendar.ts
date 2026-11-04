'use client'

import type { LiveEvent } from '@/lib/api/liveEvents'

/**
 * Add a booked event to a calendar (port of SMEEP's, after SAMA): an .ics
 * file (Apple, Outlook, any calendar) or Google Calendar. Times are written in
 * UTC, so no time zone database is needed. The join link only reaches the
 * page an hour before the start, so the entry points at the Events page,
 * where it appears.
 */

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** iCalendar separators must be escaped, or a title with a comma truncates the entry. */
const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines over 75 octets are folded, or strict parsers reject the file. */
function fold(line: string): string {
  if (line.length <= 74) return line
  const parts = [line.slice(0, 74)]
  for (let i = 74; i < line.length; i += 73) parts.push(` ${line.slice(i, i + 73)}`)
  return parts.join('\r\n')
}

const eventsPage = () => `${typeof window === 'undefined' ? '' : window.location.origin}/dashboard/events`

function details(e: LiveEvent): string {
  return [
    e.description?.trim(),
    e.format === 'in_person'
      ? null
      : e.meetingLink
        ? `Join: ${e.meetingLink}`
        : 'Your join link appears on the Hadafi Events page an hour before the start.',
    e.format === 'zoom' && e.meetingLink ? 'This Zoom link is yours alone and records your attendance. Please don’t forward it.' : null,
    e.meetingId ? `Meeting ID: ${e.meetingId}` : null,
    e.passcode ? `Passcode: ${e.passcode}` : null,
    `Events page: ${eventsPage()}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

const where = (e: LiveEvent) => (e.format === 'in_person' ? (e.location ?? '') : (e.meetingLink ?? eventsPage()))

export function buildIcs(e: LiveEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hadafi//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@hadafi`,
    // Stable, so downloading again updates the entry instead of duplicating it.
    `DTSTAMP:${stamp(e.startsAt)}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(details(e))}`,
    `LOCATION:${esc(where(e))}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(e.title)} starts in 15 minutes`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n')
}

export function downloadIcs(e: LiveEvent): void {
  const url = URL.createObjectURL(new Blob([buildIcs(e)], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${e.title.replace(/[^\w\s-]/g, '').trim() || 'event'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function googleCalendarUrl(e: LiveEvent): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${stamp(e.startsAt)}/${stamp(e.endsAt)}`,
    details: details(e),
    location: where(e),
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
