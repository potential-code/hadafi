#!/usr/bin/env node
// Prints the CRM outbox's health: how many learner events are pending, sent
// and failed (given up after too many tries), plus the oldest pending one and
// the most recent errors. Read-only: it runs in a READ ONLY transaction and
// never changes a row. See services/crmSync.service.ts.
//
// Inside the server container (Dokploy terminal), from /app:
//   node scripts/crm-outbox-status.mjs
// Locally: cd server && node --env-file=../.env scripts/crm-outbox-status.mjs
import pg from 'pg'

// Keep in step with MAX_ATTEMPTS in services/crmSync.service.ts.
const MAX_ATTEMPTS = 20

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  await client.query('BEGIN READ ONLY')
  const { rows: [counts] } = await client.query(
    `SELECT
       count(*) FILTER (WHERE sent_at IS NULL AND attempts < $1)::int AS pending,
       count(*) FILTER (WHERE sent_at IS NULL AND attempts < $1 AND attempts > 0)::int AS retrying,
       count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent,
       count(*) FILTER (WHERE sent_at IS NOT NULL AND last_error IS NOT NULL)::int AS sent_with_conflict,
       count(*) FILTER (WHERE sent_at IS NULL AND attempts >= $1)::int AS failed,
       min(created_at) FILTER (WHERE sent_at IS NULL AND attempts < $1) AS oldest_pending
     FROM crm_outbox`,
    [MAX_ATTEMPTS],
  )
  const { rows: byType } = await client.query(
    `SELECT payload->'event'->>'type' AS type,
            count(*) FILTER (WHERE sent_at IS NULL AND attempts < $1)::int AS pending,
            count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent,
            count(*) FILTER (WHERE sent_at IS NULL AND attempts >= $1)::int AS failed
     FROM crm_outbox GROUP BY 1 ORDER BY 1`,
    [MAX_ATTEMPTS],
  )
  // Event keys and errors only: no names or emails.
  const { rows: errors } = await client.query(
    `SELECT event_key, attempts, left(last_error, 160) AS last_error, next_attempt_at
     FROM crm_outbox WHERE last_error IS NOT NULL
     ORDER BY next_attempt_at DESC LIMIT 10`,
  )
  await client.query('ROLLBACK')

  const enabled = process.env.CRM_SYNC_ENABLED === 'true'
  console.log(`CRM sync sending: ${enabled ? 'on' : 'off (CRM_SYNC_ENABLED is not "true")'}`)
  console.log(`pending ${counts.pending} (retrying ${counts.retrying})  sent ${counts.sent} (409 conflicts ${counts.sent_with_conflict})  failed ${counts.failed}`)
  if (counts.oldest_pending) console.log(`oldest pending since ${new Date(counts.oldest_pending).toISOString()}`)
  if (byType.length) console.table(byType)
  if (errors.length) {
    console.log('Latest errors:')
    console.table(errors.map((e) => ({ ...e, next_attempt_at: new Date(e.next_attempt_at).toISOString() })))
  }
} finally {
  await client.end()
}
