import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { eq } from 'drizzle-orm'
import { liveEvents } from '../schema/index.ts'
import cardsData from './seed-data/hadafi-event-cards.json' with { type: 'json' }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const db = drizzle(client)

// ── Helpers ───────────────────────────────────────────────────────────────────

function localImageUrl(externalUrl: string | null | undefined): string | null {
  if (!externalUrl) return null
  const filename = externalUrl.split('/').pop()
  return filename ? `/images/events/${filename}` : null
}

function nullIfBlank(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  return t.length > 0 ? t : null
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const items = (cardsData as { cpt: { items: Array<{
  title: string
  slug: string
  status: string
  extra_image_url?: string | null
  featured_image_url?: string | null
  meta: {
    fulldate: string
    time: string
    overview_txt: string
    event_category: string
    recording_link: string
  }
}> } }).cpt.items

console.log(`[seed-hadafi-events] Seeding ${items.length} events...`)

let inserted = 0
let skipped = 0

for (const item of items) {
  // Idempotency: skip if title already exists (no unique slug in schema)
  const existing = await db.select({ id: liveEvents.id })
    .from(liveEvents)
    .where(eq(liveEvents.title, item.title))
    .limit(1)

  if (existing.length > 0) {
    console.log(`  [skip] ${item.title}`)
    skipped++
    continue
  }

  const imgUrl = item.extra_image_url || item.featured_image_url || null

  await db.insert(liveEvents).values({
    title: item.title,
    date: item.meta.fulldate,
    time: nullIfBlank(item.meta.time) ?? '5:00 PM / GST - UAE time',
    description: nullIfBlank(item.meta.overview_txt),
    type: nullIfBlank(item.meta.event_category) ?? 'Webinar',
    recordingLink: nullIfBlank(item.meta.recording_link),
    coverImage: localImageUrl(imgUrl),
    status: 'published',
    createdBy: null,
  })

  console.log(`  [inserted] ${item.title}`)
  inserted++
}

console.log(`\n[seed-hadafi-events] Done — inserted: ${inserted}, skipped: ${skipped}`)
await client.end()
