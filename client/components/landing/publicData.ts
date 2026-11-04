'use client'

import { useEffect, useState } from 'react'

/**
 * Plain, unauthenticated fetches for the public homepage. Kept here (not in
 * lib/api) so the homepage depends only on public endpoints.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`)
  return (await res.json()) as T
}

// ── Live counts (GET /api/public/counts, cached five minutes on the server) ──

export type PublicCounts = {
  courses: number
  mentors: number
  aiMentors: number
  offers: number
  events: number
}

// Shared across mounts so the page fetches the counts once.
let countsCache: PublicCounts | null = null
let countsPending: Promise<PublicCounts | null> | null = null

function loadCounts(): Promise<PublicCounts | null> {
  if (countsCache) return Promise.resolve(countsCache)
  countsPending ??= getJson<{ data?: PublicCounts }>('/api/public/counts')
    .then((j) => {
      if (j.data && typeof j.data.courses === 'number') countsCache = j.data
      return countsCache
    })
    .catch(() => {
      countsPending = null
      return null
    })
  return countsPending
}

/**
 * The live counts, or null while loading or when they could not load.
 * Callers show nothing in place of a missing number: never a fixed figure.
 */
export function usePublicCounts(): { counts: PublicCounts | null; failed: boolean } {
  const [counts, setCounts] = useState<PublicCounts | null>(countsCache)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    void loadCounts().then((c) => {
      if (!alive) return
      if (c) setCounts(c)
      else setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [])
  return { counts, failed }
}

/** A count as text when it is known and above zero, else null (show nothing). */
export function countText(n: number | undefined | null): string | null {
  return typeof n === 'number' && n > 0 ? n.toLocaleString('en-US') : null
}

// ── Course picks (GET /api/public/courses) ───────────────────────────────────

export type CoursePick = { id: string; title: string; cover: string | null; units: number }

export const fetchCoursePicks = () =>
  getJson<{ data: CoursePick[] }>('/api/public/courses').then((j) => (Array.isArray(j.data) ? j.data : []))

// ── Mentors (GET /api/mentors/public) ────────────────────────────────────────

export type PublicMentor = {
  id: string
  fullName: string
  avatarUrl: string | null
  linkedinUrl: string | null
  expertise: string[] | null
  bio: string | null
}

export const fetchPublicMentors = () =>
  getJson<PublicMentor[]>('/api/mentors/public').then((d) => (Array.isArray(d) ? d : []))

// ── Live events (GET /api/live-events/) ──────────────────────────────────────

export type PublicEvent = {
  id: string
  title: string
  type: string
  date: string // YYYY-MM-DD
  time: string
  recordingLink: string | null
  coverImage: string | null
}

export const fetchPublicEvents = () =>
  getJson<{ data: PublicEvent[] }>('/api/live-events/').then((j) => (Array.isArray(j.data) ? j.data : []))

// ── Offers (GET /api/offers/public) ──────────────────────────────────────────

export type PublicOffer = {
  id: string
  title: string
  category: string
  priceBefore: string | null
  priceLabel: string
  pointsCost: number
  imageUrl: string | null
}

export const fetchPublicOffers = () =>
  getJson<{ data: PublicOffer[] }>('/api/offers/public').then((j) => (Array.isArray(j.data) ? j.data : []))
