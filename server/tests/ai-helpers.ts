/**
 * AI analytics test fixture: the `hadafi_ai_readonly` role on the local
 * database, created with the release script's own function, and
 * AI_READONLY_DATABASE_URL pointed at it for this test process.
 *
 * The password is a fixed local test value (not a random one) so suites
 * running at the same time against the same dev database never invalidate
 * each other's connections.
 */
import pg from 'pg'
import { aiReadonlyUrl, ensureAiReadonlyRole, AI_ROLE } from '../scripts/ai-readonly-role.mjs'
import { closeAiReadonlyPool } from '../services/ai-sql/readonly-pool'

const TEST_PASSWORD = 'e2elocalaireadonly0000'

export async function useAiReadonlyRole(): Promise<string> {
  const databaseUrl = process.env['DATABASE_URL']!
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query('begin')
    await ensureAiReadonlyRole(client)
    await client.query(`alter role ${AI_ROLE} password '${TEST_PASSWORD}'`)
    await client.query('commit')
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
  const url = aiReadonlyUrl(databaseUrl, TEST_PASSWORD)
  await closeAiReadonlyPool()
  process.env['AI_READONLY_DATABASE_URL'] = url
  return url
}

export async function withoutAiReadonlyRole<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env['AI_READONLY_DATABASE_URL']
  delete process.env['AI_READONLY_DATABASE_URL']
  await closeAiReadonlyPool()
  try {
    return await fn()
  } finally {
    if (saved !== undefined) process.env['AI_READONLY_DATABASE_URL'] = saved
  }
}
