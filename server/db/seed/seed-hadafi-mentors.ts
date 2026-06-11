import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { eq } from 'drizzle-orm'
import { users, mentorRegistrations } from '../schema/index.ts'
import cardsData from './seed-data/hadafi-expert-cards.json' with { type: 'json' }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const db = drizzle(client)

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugToEmail(slug: string): string {
  return `${slug.replace(/-/g, '.')}@hadafi.potential.org`
}

function localAvatarUrl(externalUrl: string | null | undefined): string | null {
  if (!externalUrl) return null
  const filename = externalUrl.split('/').pop()
  return filename ? `/images/mentors/${filename}` : null
}

function nullIfBlank(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  return t.length > 0 ? t : null
}

function parseExpertise(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== 'featured')
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const items = (cardsData as { cpt: { items: Array<{
  title: string
  slug: string
  status: string
  extra_image_url?: string | null
  featured_image_url?: string | null
  meta: {
    expert_category: string
    linkedinurl: string
    overview_txt: string
  }
}> } }).cpt.items

console.log(`[seed-hadafi-mentors] Seeding ${items.length} mentors (all as approved)...`)

let inserted = 0
let skipped = 0

for (const item of items) {
  const email = slugToEmail(item.slug)
  const avatarUrl = localAvatarUrl(item.extra_image_url || item.featured_image_url || null)
  const bio = nullIfBlank(item.meta.overview_txt)
  const linkedinUrl = nullIfBlank(item.meta.linkedinurl)
  const expertise = parseExpertise(item.meta.expert_category ?? '')

  // Step A: insert user (onConflictDoNothing — email is unique)
  const passwordHash = await bcrypt.hash(randomUUID(), 10)

  await db.insert(users).values({
    fullName: item.title,
    email,
    passwordHash,
    role: 'mentor',
    bio,
    avatarUrl,
  }).onConflictDoNothing()

  // Fetch the user (whether just inserted or already existed)
  const [user] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user) {
    console.log(`  [error] Could not find/create user for ${email}`)
    continue
  }

  // Step B: insert mentor_registration (onConflictDoNothing — email is unique)
  const existing = await db.select({ id: mentorRegistrations.id })
    .from(mentorRegistrations)
    .where(eq(mentorRegistrations.email, email))
    .limit(1)

  if (existing.length > 0) {
    console.log(`  [skip] ${item.title} (${email})`)
    skipped++
    continue
  }

  await db.insert(mentorRegistrations).values({
    name: item.title,
    email,
    linkedinUrl,
    expertise,
    status: 'approved',
    userId: user.id,
    hourlyRate: null,
    methods: null,
    passion: null,
  })

  console.log(`  [inserted] ${item.title} → ${email}`)
  inserted++
}

console.log(`\n[seed-hadafi-mentors] Done — inserted: ${inserted}, skipped: ${skipped}`)
await client.end()
