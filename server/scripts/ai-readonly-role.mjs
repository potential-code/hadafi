#!/usr/bin/env node
// AI analytics: the read-only Postgres role AI Insights and the AI Dashboard
// query as (`hadafi_ai_readonly`, set as AI_READONLY_DATABASE_URL). Ported from
// SMEEP's `prod-prep.mjs ai-readonly-role` / `ai-readonly-check` (4e89bc4).
//
// Its GRANTs are the real security boundary: it can SELECT the `ai` views and
// nothing else, read-only, with a 15 s statement timeout, whatever SQL gets
// past the server's guard. Without AI_READONLY_DATABASE_URL the AI pages say
// they aren't set up; there is no fallback to the app's own connection.
//
// Run inside the server container (Dokploy terminal), from /app, AFTER the new
// server has started once (its migrations create the `ai` views):
//   node scripts/ai-readonly-role.mjs create                  preview (rolls back)
//   node scripts/ai-readonly-role.mjs create --apply          create the role, print the URL once
//   node scripts/ai-readonly-role.mjs create --new-password --apply   replace a lost password
//   node scripts/ai-readonly-role.mjs check                   connect AS the role and prove it
// Locally: cd server && node --env-file=../.env scripts/ai-readonly-role.mjs check
//
// DATABASE_URL must be a user that can create roles (in the compose setup it
// is the `postgres` superuser). Without one, run scripts/ai-readonly-role.sql
// by hand instead. The prod-prep script can import the two functions below.
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

export const AI_ROLE = 'hadafi_ai_readonly'

/** The statements that give AI_ROLE exactly SELECT on `ai` (also in ai-readonly-role.sql). */
export function grantStatements(appRole) {
  const app = pg.escapeIdentifier(appRole)
  return [
    `alter role ${AI_ROLE} nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit`,
    // The app role owns `ai`, so its migrations can drop and recreate the views.
    `create schema if not exists ai authorization ${app}`,
    `alter schema ai owner to ${app}`,
    // Nothing in public: not the tables, not the sequences, not the schema.
    `revoke all on schema public from ${AI_ROLE}`,
    `revoke all on all tables in schema public from ${AI_ROLE}`,
    `revoke all on all sequences in schema public from ${AI_ROLE}`,
    `revoke all on all functions in schema public from ${AI_ROLE}`,
    // Only the `ai` views (plain views run with their owner's rights, so the
    // role needs no grant on the tables behind them).
    `grant usage on schema ai to ${AI_ROLE}`,
    `grant select on all tables in schema ai to ${AI_ROLE}`,
    `grant execute on all functions in schema ai to ${AI_ROLE}`,
    // Views a later migration creates are readable too.
    `alter default privileges for role ${app} in schema ai grant select on tables to ${AI_ROLE}`,
    // Duplicated by the server's pool and by each transaction, so the ceiling
    // holds even for someone connecting with psql.
    `alter role ${AI_ROLE} set statement_timeout = '15s'`,
    `alter role ${AI_ROLE} set idle_in_transaction_session_timeout = '10s'`,
    `alter role ${AI_ROLE} set default_transaction_read_only = on`,
    `alter role ${AI_ROLE} set search_path = ai`,
  ]
}

/**
 * Creates (or re-grants) AI_ROLE using `client`, which must be inside a
 * transaction the caller commits or rolls back. Returns the new password when
 * one was set (a new role, or `newPassword`), else null.
 */
/**
 * @param {import('pg').ClientBase} client
 * @param {{ newPassword?: boolean, log?: (line: string) => void }} [options]
 * @returns {Promise<{ password: string | null, appRole: string, created: boolean }>}
 */
export async function ensureAiReadonlyRole(client, { newPassword = false, log = () => {} } = {}) {
  const me = (
    await client.query(
      `select current_user as name, rolsuper as superuser, rolsuper or rolcreaterole as can_create
       from pg_roles where rolname = current_user`,
    )
  ).rows[0]
  if (!me?.can_create) {
    throw new Error(`The database user "${me?.name}" can't create roles. Use a superuser DATABASE_URL, or run scripts/ai-readonly-role.sql by hand.`)
  }
  const existing = (await client.query(`select 1 from pg_roles where rolname = $1`, [AI_ROLE])).rowCount > 0
  // Hex only, so it is safe in the SQL literal below and in a URL.
  const password = !existing || newPassword ? randomBytes(24).toString('hex') : null
  if (!existing) {
    await client.query(`create role ${AI_ROLE} login password '${password}'`)
    log(`  Created role ${AI_ROLE}`)
  } else if (password) {
    await client.query(`alter role ${AI_ROLE} password '${password}'`)
    log(`  ${AI_ROLE} exists: new password set`)
  } else {
    log(`  ${AI_ROLE} exists: password kept (add --new-password to replace it)`)
  }
  for (const statement of grantStatements(me.name)) await client.query(statement)

  // Postgres before 15 lets every role (PUBLIC) create tables in `public`.
  // Take that away when it is safe to: the app user is a superuser or owns
  // `public`, so it never relied on the PUBLIC grant itself.
  const publicCreate = (await client.query(`select has_schema_privilege($1, 'public', 'create') as yes`, [AI_ROLE])).rows[0].yes
  if (publicCreate) {
    const owns = (
      await client.query(`select pg_get_userbyid(nspowner) = current_user as owns from pg_namespace where nspname = 'public'`)
    ).rows[0]?.owns
    if (me.superuser || owns) {
      await client.query(`revoke create on schema public from public`)
      log('  Removed the default CREATE on schema public from PUBLIC (Postgres < 15)')
    } else {
      log('  WARNING: every role may create in schema public here, and this user cannot change that. Ask the database owner to run: revoke create on schema public from public;')
    }
  }
  log(`  Grants: SELECT on the ai views only (owner of ai: ${me.name}); read-only, 15 s statement timeout`)
  return { password, appRole: me.name, created: !existing }
}

/** AI_READONLY_DATABASE_URL for `password`: DATABASE_URL with the role's credentials. */
export function aiReadonlyUrl(databaseUrl, password) {
  const url = new URL(databaseUrl)
  url.username = AI_ROLE
  url.password = password
  return url.toString()
}

/**
 * Connects AS the read-only role and proves it can read the ai views and
 * nothing else. Resolves to the number of failed checks.
 */
/**
 * @param {string} url
 * @param {(line: string) => void} [log]
 * @returns {Promise<number>}
 */
export async function checkAiReadonlyRole(url, log = () => {}) {
  const ro = new pg.Client({ connectionString: url })
  await ro.connect()
  let failed = 0
  const expect = async (label, sql, shouldWork) => {
    try {
      await ro.query(sql)
      if (shouldWork) log(`  ok    ${label}`)
      else {
        failed++
        log(`  FAIL  ${label}: it worked, and must not`)
      }
    } catch (err) {
      if (shouldWork) {
        failed++
        log(`  FAIL  ${label}: ${err.message}`)
      } else log(`  ok    ${label} (refused)`)
    }
  }
  try {
    const who = (await ro.query(`select current_user as name, r.rolsuper, r.rolbypassrls from pg_roles r where r.rolname = current_user`)).rows[0]
    log(`  connected as ${who.name}`)
    if (who.name !== AI_ROLE) {
      failed++
      log(`  FAIL  expected ${AI_ROLE}`)
    }
    if (who.rolsuper || who.rolbypassrls) {
      failed++
      log('  FAIL  role is superuser or bypasses RLS')
    }
    const views = (await ro.query(`select count(*)::int as n from pg_views where schemaname = 'ai'`)).rows[0].n
    if (views === 0) {
      failed++
      log('  FAIL  no ai views yet: start the new Hadafi server once (its migrations create them), then re-run')
    } else {
      await expect(`reads the ai views (${views})`, 'select count(*) from ai.learner', true)
    }
    await expect('reads public.users', 'select count(*) from public.users', false)
    await expect('reads auth_accounts (password hashes)', 'select count(*) from public.auth_accounts', false)
    await expect('reads offer_redemptions (billing)', 'select count(*) from public.offer_redemptions', false)
    await expect('reads pg_authid', 'select * from pg_catalog.pg_authid limit 1', false)
    await expect('creates a table in public', 'create table public._ai_probe (i int)', false)
    await expect('writes in ai', 'create view ai._ai_probe as select 1', false)
    await expect('turns read-only off and creates a table', 'set default_transaction_read_only = off; create table public._ai_probe2 (i int)', false)
  } finally {
    await ro.end()
  }
  return failed
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] ?? 'check'
  const apply = args.includes('--apply')
  const line = (s = '') => console.log(s)

  if (command === 'check') {
    const url = (process.env.AI_READONLY_DATABASE_URL ?? '').trim()
    if (!url) {
      console.error('AI_READONLY_DATABASE_URL is not set on this server. Run `create --apply` first, set it, redeploy.')
      process.exit(1)
    }
    line('\n== Read-only role check ==')
    const failed = await checkAiReadonlyRole(url, line)
    line(failed ? `\n${failed} check(s) FAILED: fix the role before relying on it.` : '\nAll checks passed: AI queries run as a role that can only read the ai views.')
    if (failed) process.exitCode = 1
    return
  }
  if (command !== 'create') {
    console.error('Usage: node scripts/ai-readonly-role.mjs create [--new-password] [--apply] | check')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  let result
  try {
    await client.query('begin')
    line('\n== ai-readonly-role ==')
    result = await ensureAiReadonlyRole(client, { newPassword: args.includes('--new-password'), log: line })
    await client.query(apply ? 'commit' : 'rollback')
    line(apply ? '  Applied.' : '  Preview only: rolled back. Re-run with --apply.')
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
  if (!result.password || !apply) return
  line('\nSet this on the Hadafi server in Dokploy, redeploy, then run `node scripts/ai-readonly-role.mjs check`:')
  line(`\n  AI_READONLY_DATABASE_URL=${aiReadonlyUrl(process.env.DATABASE_URL, result.password)}\n`)
  line('  It is shown once. If it is lost, re-run with --new-password --apply.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
