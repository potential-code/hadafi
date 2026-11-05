/**
 * The bell: in-app notifications for the signed-in user (any role).
 * Same-origin, so the httpOnly session cookie rides along.
 */
import { apiFetch } from '@/lib/api'

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  createdAt: string
  readAt: string | null
}

export type NotificationList = { items: NotificationItem[]; unread: number }

const BASE = '/api/me/notifications'

export async function fetchNotifications(): Promise<NotificationList> {
  return (await apiFetch<{ data: NotificationList }>(BASE)).data
}

export async function fetchUnreadCount(): Promise<number> {
  return (await apiFetch<{ data: { unread: number } }>(`${BASE}/unread-count`)).data.unread
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`${BASE}/${encodeURIComponent(id)}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch(`${BASE}/read-all`, { method: 'POST' })
}
