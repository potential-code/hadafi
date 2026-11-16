import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createConsentStore } from '@/lib/consent/store'
import { pollBell } from '../NotificationBell'

/**
 * Hadafi's bell normally polls only the unread count; the list loads when the
 * panel opens. The learner GTM events (first_lesson_completed,
 * course_certificate) come from the server's one-time badge:first_step and
 * certificate:<id> notifications, so while GTM is configured the poll reads
 * the list and hands it to consentStore.noteNotifications. With GTM off
 * (the kill switch) it is the count alone, exactly as before.
 */

const NOW = new Date('2026-11-16T10:00:00Z')
const item = (id: string, dedupeKey: string, type: string) => ({
  id,
  type,
  dedupeKey,
  title: 'New badge: First step',
  body: 'Complete your first learning step',
  link: '/dashboard/achievements',
  createdAt: NOW.toISOString(),
  readAt: null,
})

function fakeApi() {
  const calls: string[] = []
  return {
    calls,
    api: {
      fetchUnreadCount: async () => {
        calls.push('count')
        return 3
      },
      fetchNotifications: async () => {
        calls.push('list')
        return { items: [item('n1', 'badge:first_step', 'badge')], unread: 4 }
      },
    },
  }
}

describe('the bell poll', () => {
  it('reads only the count while GTM is off', async () => {
    const store = createConsentStore({ now: () => NOW })
    store.configure(null)
    const { calls, api } = fakeApi()
    expect(await pollBell(store, api)).toBe(3)
    expect(calls).toEqual(['count'])
  })

  it('reads the list while GTM is configured and passes it to noteNotifications', async () => {
    const store = createConsentStore({ now: () => NOW })
    store.configure('GTM-TEST1234')
    const seen: string[][] = []
    const spy = { ...store, getState: store.getState, noteNotifications: (items: { id: string }[]) => void seen.push(items.map((i) => i.id)) }
    const { calls, api } = fakeApi()
    expect(await pollBell(spy, api)).toBe(4)
    expect(calls).toEqual(['list'])
    expect(seen).toEqual([['n1']])
  })

  it('every list fetch (poll and opening the panel) goes through noteNotifications', () => {
    const src = readFileSync(path.join(import.meta.dir, '..', 'NotificationBell.tsx'), 'utf8')
    expect(src).toContain('consentStore.noteNotifications(d.items)')
    expect(src).toMatch(/pollBell\(/)
  })
})
