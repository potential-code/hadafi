import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { sql } from 'drizzle-orm'
import { offers } from '../schema/index.ts'
import cardsData from './seed-data/hadafi-offer-cards.json' with { type: 'json' }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const db = drizzle(client)

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCategory(raw: string): string {
  const cleaned = raw.replace(/\bfeatured\b/gi, '').replace(/,+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  if (cleaned === 'ai') return 'AI'
  if (cleaned === 'marketing') return 'Marketing'
  if (cleaned === 'it' || cleaned.includes('webservices')) return 'IT'
  if (cleaned === 'finance') return 'Finance'
  if (cleaned === 'pr') return 'PR'
  if (cleaned === 'ecommerce') return 'Ecommerce'
  if (cleaned === 'training') return 'Training'
  return 'Other'
}

function parseOfferPrice(html: string): { priceBefore: string | null; priceLabel: string } {
  const beforeMatch = html.match(/<span[^>]*line-through[^>]*>(.*?)<\/span>/i)
  const priceBefore = beforeMatch ? beforeMatch[1].trim() : null
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  let priceLabel = stripped
  if (priceBefore && stripped.startsWith(priceBefore)) {
    priceLabel = stripped.slice(priceBefore.length).trim()
  }
  return { priceBefore, priceLabel }
}

function localImageUrl(externalUrl: string | null): string | null {
  if (!externalUrl) return null
  const filename = externalUrl.split('/').pop()
  return filename ? `/images/offers/${filename}` : null
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const items = (cardsData as { cpt: { items: Array<{
  title: string
  slug: string
  status: string
  extra_image_url: string | null
  meta: { offer_category: string; offerprice: string; couponoffer: string }
}> } }).cpt.items

console.log(`[seed-hadafi-offers] Seeding ${items.length} offers...`)

let count = 0
for (const item of items) {
  const { priceBefore, priceLabel } = parseOfferPrice(item.meta.offerprice ?? '')
  const pointsCost = parseInt((item.meta.couponoffer ?? '').trim(), 10) || 0

  await db.insert(offers).values({
    title: item.title,
    slug: item.slug,
    category: normalizeCategory(item.meta.offer_category ?? ''),
    priceLabel: priceLabel || 'Contact for pricing',
    priceBefore,
    price: 0,
    pointsCost,
    imageUrl: localImageUrl(item.extra_image_url),
    status: item.status === 'publish' ? 'published' : 'draft',
  }).onConflictDoUpdate({
    target: offers.slug,
    set: {
      title: sql`EXCLUDED.title`,
      category: sql`EXCLUDED.category`,
      priceLabel: sql`EXCLUDED.price_label`,
      priceBefore: sql`EXCLUDED.price_before`,
      pointsCost: sql`EXCLUDED.points_cost`,
      imageUrl: sql`EXCLUDED.image_url`,
      status: sql`EXCLUDED.status`,
      updatedAt: sql`now()`,
    },
  })

  console.log(`  [${item.status === 'publish' ? 'published' : 'draft'}] ${item.title}`)
  count++
}

console.log(`\n[seed-hadafi-offers] Done — ${count} offers upserted.`)
await client.end()
