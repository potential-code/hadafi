import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import path from 'path'
import fs from 'fs'
import { eq } from 'drizzle-orm'
import { courses } from '../schema/index.ts'
import cardsData from './seed-data/hadafi-course-cards.json' with { type: 'json' }

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const HADAFI_COURSES_DIR = path.resolve(SCRIPT_DIR, 'seed-data/hadafi-courses')

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const db = drizzle(client)

let inserted = 0
let skipped = 0

// ── Pass A: 47 published cards (with cover images) ───────────────────────────

const items = (cardsData as { cpt: { items: Array<{
  title: string
  slug: string
  status: string
  meta: { course_id: string; course_image_url: string }
}> } }).cpt.items

const published = items.filter(item => item.status === 'publish')
const cardWpIds = new Set(published.map(i => i.meta.course_id).filter(Boolean))

console.log(`[seed-hadafi-courses] Pass A — seeding ${published.length} published cards...`)

for (const item of published) {
  const existing = await db.select({ id: courses.id })
    .from(courses).where(eq(courses.title, item.title)).limit(1)

  if (existing.length > 0) {
    console.log(`  [skip] ${item.title}`)
    skipped++
    continue
  }

  const imgUrl = item.meta.course_image_url
  let cover: string | null = null
  if (imgUrl) {
    const filename = imgUrl.split('/').pop() ?? ''
    const ext = path.extname(filename) || '.png'
    cover = `/images/courses/${item.slug}${ext}`
  }

  await db.insert(courses).values({
    title: item.title,
    cover,
    status: 'published',
    difficulty: 'Beginner',
  })
  console.log(`  [inserted] ${item.title}`)
  inserted++
}

// ── Pass B: extra courses in hadafi-courses/ not covered by cards ─────────────

const folders = fs.readdirSync(HADAFI_COURSES_DIR).filter(f =>
  fs.existsSync(path.join(HADAFI_COURSES_DIR, f, 'course.json'))
)

const extraFolders = folders.filter(folder => {
  const m = folder.match(/course-(\d+)-/)
  if (!m) return false
  return !cardWpIds.has(m[1])
})

console.log(`\n[seed-hadafi-courses] Pass B — seeding ${extraFolders.length} extra courses...`)

for (const folder of extraFolders) {
  const courseJson = JSON.parse(
    fs.readFileSync(path.join(HADAFI_COURSES_DIR, folder, 'course.json'), 'utf-8')
  )
  const title: string = courseJson?.course?.title
  if (!title) {
    console.log(`  [skip] ${folder} — no title in course.json`)
    continue
  }

  const existing = await db.select({ id: courses.id })
    .from(courses).where(eq(courses.title, title)).limit(1)

  if (existing.length > 0) {
    console.log(`  [skip] ${title}`)
    skipped++
    continue
  }

  await db.insert(courses).values({
    title,
    cover: null,
    status: 'published',
    difficulty: 'Beginner',
  })
  console.log(`  [inserted] ${title}`)
  inserted++
}

console.log(`\n[seed-hadafi-courses] Done — inserted: ${inserted}, skipped: ${skipped}`)
await client.end()
