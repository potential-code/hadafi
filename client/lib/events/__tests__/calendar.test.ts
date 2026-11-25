import { describe, expect, it } from 'bun:test'
import { buildIcs } from '../calendar'
import type { LiveEvent } from '@/lib/api/liveEvents'

/** iCalendar text values (RFC 5545 3.3.11): backslash, ';' and ',' are escaped with a backslash. */
const event = (title: string): LiveEvent =>
  ({
    id: 'e1',
    title,
    description: null,
    type: 'webinar',
    date: '',
    time: '',
    startsAt: '2026-12-01T10:00:00.000Z',
    endsAt: '2026-12-01T11:00:00.000Z',
    timezone: 'UTC',
    format: 'in_person',
    location: 'Hall A; Floor 2, Dubai',
    meetingLink: null,
    recordingLink: null,
    coverImage: null,
    status: 'published',
    capacity: null,
    startedAt: null,
    endedAt: null,
  }) as LiveEvent

describe('buildIcs', () => {
  it("escapes ';' and ',' with a backslash", () => {
    const ics = buildIcs(event('Pricing; profit, and you'))
    expect(ics).toContain('SUMMARY:Pricing\\; profit\\, and you')
    expect(ics).toContain('LOCATION:Hall A\\; Floor 2\\, Dubai')
  })

  it('escapes a backslash before anything else', () => {
    expect(buildIcs(event('a\\b;c'))).toContain('SUMMARY:a\\\\b\\;c')
  })
})
