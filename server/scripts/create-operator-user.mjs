#!/usr/bin/env node
// Creates the operator service account (Maya, the AI operator) that operator
// keys act as. See docs/operator-access.md.
//
// Inside the server container (Dokploy terminal), from /app:
//   node scripts/create-operator-user.mjs --email maya@potential.org          (preview)
//   node scripts/create-operator-user.mjs --email maya@potential.org --apply
// Locally: cd server && node --env-file=../.env scripts/create-operator-user.mjs ...
//
// --email defaults to OPERATOR_SERVICE_USER_EMAIL. Idempotent: an existing
// service account is left as it is. The account is an admin named
// "Maya (AI operator)" with no password or other sign-in (no auth_accounts
// row), and the server refuses any sign-in or session for it; it can only be
// used through operator keys. It refuses to promote an existing non-admin
// account, to take over an admin that has a way to sign in (a person), or to
// adopt an admin it did not create (any other name).
//
// Changes run in a transaction that is ROLLED BACK unless --apply is given.
import pg from 'pg'

// The server refuses sign-in for any account with this name, even with
// OPERATOR_SERVICE_USER_EMAIL unset (auth/operatorKeys.ts OPERATOR_SERVICE_NAME;
// a test keeps the two in step). Don't change one without the other.
const NAME = 'Maya (AI operator)'
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const argValue = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const email = (argValue('--email') ?? process.env.OPERATOR_SERVICE_USER_EMAIL ?? '').trim().toLowerCase()
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node scripts/create-operator-user.mjs --email <service-account-email> [--apply]')
  console.error('  (or set OPERATOR_SERVICE_USER_EMAIL)')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

class Refusal extends Error {}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows: found } = await client.query(
      'select id, role, full_name from users where lower(email) = $1 limit 1',
      [email],
    )
    const existing = found[0]
    if (existing) {
      if (existing.role !== 'admin') {
        throw new Refusal(`${email} already exists with role "${existing.role}". Refusing to promote an existing account; pick an address used only by the operator.`)
      }
      const { rows: accounts } = await client.query('select provider_id from auth_accounts where user_id = $1', [existing.id])
      if (accounts.length > 0) {
        throw new Refusal(`${email} is an admin with a way to sign in (${accounts.map((a) => a.provider_id).join(', ')}): a person, not a service account. Pick another address.`)
      }
      if (existing.full_name !== NAME) {
        throw new Refusal(`${email} is an admin with no sign-in named "${existing.full_name}", not "${NAME}": this script did not create it, so it may belong to someone. Refusing to use it as the operator service account; pick another address, or check who owns this one.`)
      }
      console.log(`${email} is already set up as the operator service account (id ${existing.id}, "${existing.full_name}"). Nothing to change.`)
      await client.query('rollback')
      return
    }

    const { rows: created } = await client.query(
      `insert into users (full_name, email, role, email_verified) values ($1, $2, 'admin', false) returning id`,
      [NAME, email],
    )
    console.log(`Creating "${NAME}" <${email}> as an admin with no sign-in (id ${created[0].id}).`)
    if (apply) {
      await client.query('commit')
      console.log('APPLIED. Set OPERATOR_SERVICE_USER_EMAIL to this address on the server.')
    } else {
      await client.query('rollback')
      console.log('preview only, nothing was changed. Re-run with --apply to create it.')
    }
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

try {
  await main()
} catch (err) {
  console.error(err instanceof Refusal ? err.message : `Failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
