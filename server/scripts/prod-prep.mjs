#!/usr/bin/env node
// Production data prep for the Hadafi revamp release (redesign + Better Auth
// and the features since). Adapted from SMEEP's scripts/prod-prep.mjs.
//
// Run inside the server container (Dokploy terminal), from /app:
//   node scripts/prod-prep.mjs audit
//   node scripts/prod-prep.mjs set-admins a@x.com b@y.com           [--apply]
//   node scripts/prod-prep.mjs retire-default-admin                  [--apply]
//   node scripts/prod-prep.mjs verify-accounts --domain d | a@x b@y  [--apply]
//   node scripts/prod-prep.mjs ai-readonly-role [--new-password]     [--apply]
//   node scripts/prod-prep.mjs ai-readonly-check
//   node scripts/prod-prep.mjs certificate-check
//
// `audit`, `ai-readonly-check` and `certificate-check` only read. Every other
// command runs its changes in one transaction and ROLLS BACK unless --apply is
// given, so a plain run shows exactly what would change.
//
// `audit` prints counts only: never a name or an email. The write commands
// echo back only the emails you typed.
//
// Locally: cd server && node --env-file=../.env scripts/prod-prep.mjs audit
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { AI_ROLE, aiReadonlyUrl, checkAiReadonlyRole, ensureAiReadonlyRole } from './ai-readonly-role.mjs'

const DEFAULT_ADMIN = 'admin@email.com'
// Must match RENDER_VERSION in server/services/lms/certificate.service.ts: a
// certificate whose image isn't "<id>-v<N>.png" is drawn again on boot.
const CERT_RENDER_VERSION = 2
// Whoever is staff. Every other role ('sme' learners, 'partner') is left alone.
const STAFF_ROLES = ['admin', 'mentor']

// Both layouts: /app/scripts + /app/db (the image) and server/scripts + server/db (the repo).
const MIGRATIONS_DIR = new URL('../db/migrations/', import.meta.url)

const argv = process.argv.slice(2)
const command = argv[0] ?? 'audit'
const apply = argv.includes('--apply')
const newPassword = argv.includes('--new-password')
/** Value after `--name`, split on commas. */
const flagList = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? [] : (argv[i + 1] ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}
/** Emails given either as `--emails a,b` or as plain arguments after the command. */
const emailArgs = () => {
  const flagged = flagList('--emails')
  const skip = new Set()
  for (const f of ['--emails', '--domain']) {
    const i = argv.indexOf(f)
    if (i !== -1) skip.add(i + 1)
  }
  const positional = argv
    .slice(1)
    .filter((a, i) => !a.startsWith('--') && !skip.has(i + 1))
    .flatMap((a) => a.split(','))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const all = [...new Set([...flagged, ...positional])]
  const bad = all.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  if (bad.length) {
    console.error(`Not an email address: ${bad.join(', ')}`)
    process.exit(1)
  }
  return all
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const q = (sql, params = []) => pool.query(sql, params).then((r) => r.rows)
const line = (s = '') => console.log(s)
const heading = (s) => line(`\n== ${s} ==`)

async function exists(table, column) {
  const rows = column
    ? await q(`select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`, [table, column])
    : await q(`select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [table])
  return rows.length > 0
}

/** Runs `work(client)` in a transaction; commits only with --apply. */
async function transaction(label, work) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await work(client)
    if (apply) {
      await client.query('commit')
      line(`\n${label}: APPLIED.`)
    } else {
      await client.query('rollback')
      line(`\n${label}: preview only, nothing was changed. Re-run with --apply to make these changes.`)
    }
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

async function requireBetterAuth() {
  if (!(await exists('users', 'email_verified'))) {
    console.error('Run this after the new server has started once (migration 0022_better_auth adds the columns it needs).')
    process.exit(1)
  }
}

// ─── audit ───────────────────────────────────────────────────────────────────

/**
 * Tables and columns a pending migration creates WITHOUT "if not exists".
 * If one already exists, that migration fails and the new server won't start.
 * Read from the migration files themselves, so it covers migrations added later.
 */
function unguardedObjects(tag) {
  const file = new URL(`${tag}.sql`, MIGRATIONS_DIR)
  if (!existsSync(file)) return []
  const sql = readFileSync(file, 'utf8')
  const found = []
  for (const m of sql.matchAll(/CREATE TABLE (?!IF NOT EXISTS)"([^"]+)"/gi)) found.push([m[1]])
  for (const m of sql.matchAll(/ALTER TABLE "([^"]+)" ADD COLUMN (?!IF NOT EXISTS)"([^"]+)"/gi)) found.push([m[1], m[2]])
  return found
}

/**
 * The same reading of an old free-text event time as migration 0025_event_times
 * (and server/services/eventTimes.ts). Returns true when 0025 would flag it
 * "time to check" (time_needs_review): a date that isn't YYYY-MM-DD, a time it
 * can't read, or a time that names another time zone.
 */
function eventTimeNeedsReview(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '')
  const realDate = d && new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).toISOString().slice(0, 10) === date
  const t = time ?? ''
  const ap = /(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]/.exec(t)
  const hm = /(\d{1,2}):(\d{2})/.exec(t)
  const readable = (ap && +ap[1] >= 1 && +ap[1] <= 12 && +(ap[2] ?? '0') < 60) || (hm && +hm[1] < 24 && +hm[2] < 60)
  const otherZone = /\b(EST|EDT|PST|PDT|CST|CDT|MST|MDT|GMT|UTC|BST|CET|CEST|EET|KSA|AST|IST|WAT|EAT|PKT|Riyadh|Cairo|London)\b/i.test(t)
  return !realDate || !readable || otherZone
}

async function audit() {
  heading('Migrations')
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS_DIR), 'utf8')).entries
  let lastApplied = 0
  try {
    const [row] = await q('select max(created_at)::bigint as last from drizzle.__drizzle_migrations')
    lastApplied = Number(row?.last ?? 0)
  } catch {
    line('  No drizzle.__drizzle_migrations table: every migration would run.')
  }
  const pending = journal.filter((e) => e.when > lastApplied)
  const last = journal.filter((e) => e.when <= lastApplied).at(-1)
  line(`  Migrations in this build: ${journal.length} (last ${journal.at(-1)?.tag})`)
  line(`  Last applied here: ${last ? last.tag : 'none'}`)
  line(`  Pending (applied automatically when the new server starts): ${pending.length ? pending.map((e) => e.tag).join(', ') : 'none'}`)
  let blocked = false
  for (const e of pending) {
    for (const [table, column] of unguardedObjects(e.tag)) {
      if (await exists(table, column)) {
        blocked = true
        line(`  !! ${e.tag} is pending but ${column ? `${table}.${column}` : table} already exists: that migration will fail. Fix drizzle.__drizzle_migrations before deploying.`)
      }
    }
  }
  if (!blocked) line('  OK: no pending migration collides with an existing table or column.')

  heading('Accounts (counts only)')
  const roles = await q(`select role, count(*)::int as n from users group by role order by role`)
  for (const r of roles) line(`  ${String(r.role).padEnd(10)} ${r.n}`)
  line(`  ${'total'.padEnd(10)} ${roles.reduce((s, r) => s + r.n, 0)}`)
  const hasAuth = await exists('users', 'email_verified')
  const [adm] = await q(
    `select count(*)::int as admins,
            count(*) filter (where lower(email) <> $1)::int as real_admins,
            bool_or(lower(email) = $1) as has_default
            ${hasAuth ? `, count(*) filter (where email_verified and lower(email) <> $1)::int as verified_real` : ''}
       from users where role = 'admin'`,
    [DEFAULT_ADMIN],
  )
  line(`  Admins: ${adm.admins} (${adm.real_admins} besides the default${hasAuth ? `, ${adm.verified_real} of them verified` : ''})`)
  const [anyDefault] = await q(`select role from users where lower(email) = $1`, [DEFAULT_ADMIN])
  if (adm.has_default) line(`  !! The default ${DEFAULT_ADMIN} admin exists. Run set-admins, sign in as one, then retire-default-admin.`)
  else if (anyDefault) line(`  The default ${DEFAULT_ADMIN} account exists with role ${anyDefault.role}.`)
  else line(`  OK: the default ${DEFAULT_ADMIN} account is gone.`)

  if (hasAuth) {
    const [v] = await q(`
      select count(*) filter (where u.legacy_account)::int as legacy,
             count(*) filter (where u.legacy_account and not u.email_verified)::int as legacy_unverified,
             count(*) filter (where u.legacy_account and not exists (
               select 1 from auth_accounts a where a.user_id = u.id and a.provider_id = 'credential' and a.password is not null))::int as legacy_no_credential,
             count(*) filter (where u.legacy_account and u.password_hash is not null and not exists (
               select 1 from auth_accounts a where a.user_id = u.id and a.provider_id = 'credential'))::int as hash_not_copied,
             count(*) filter (where not u.email_verified)::int as unverified,
             count(*) filter (where not u.email_verified and u.role = any($1))::int as staff_unverified
        from users u`, [STAFF_ROLES])
    line(`  Accounts from before Better Auth: ${v.legacy}`)
    line(`    still to confirm their email (code on next sign-in): ${v.legacy_unverified}`)
    line(`    without a password sign-in (code only): ${v.legacy_no_credential}`)
    if (v.hash_not_copied) line(`  !! ${v.hash_not_copied} have an old password hash that 0022 did not copy into auth_accounts: their password won't work.`)
    line(`  Unverified accounts in all: ${v.unverified} (admins and mentors: ${v.staff_unverified})`)
    if (v.staff_unverified) {
      // Domains, not addresses: imported mentors often share one that isn't a mailbox they read.
      const domains = await q(
        `select split_part(lower(email), '@', 2) as domain, count(*)::int as n from users
          where not email_verified and role = any($1) and lower(email) <> $2 group by 1 order by 2 desc`, [STAFF_ROLES, DEFAULT_ADMIN])
      for (const d of domains) line(`    unverified staff @${d.domain}: ${d.n}`)
      line('  If a domain cannot receive sign-in codes: verify-accounts --domain <domain>')
    }
  } else {
    line('  Better Auth migration (0022_better_auth) not applied yet: it marks every existing account as legacy.')
  }
  const [tests] = await q(
    `select count(*)::int as n from users u
      where u.email ~* '@(test|e2e|demo|example)\\.|@localhost|@mailinator\\.|^(test|qa|demo)[._+-]|[._+-](test|qa)[0-9]*@|\\+test'
         or u.full_name ~* '\\m(test|tester|qa|demo|dummy)\\M'`,
  )
  line(`  Accounts that look like tests (review in Admin > Users; nothing is removed here): ${tests.n}`)

  heading('Live events')
  if (await exists('live_events')) {
    if (await exists('live_events', 'time_needs_review')) {
      const [ev] = await q(`
        select count(*)::int as total,
               count(*) filter (where time_needs_review)::int as review,
               count(*) filter (where time_needs_review and starts_at > now())::int as review_upcoming,
               count(*) filter (where status = 'published' and starts_at > now())::int as upcoming
          from live_events`)
      line(`  Events: ${ev.total}; upcoming and published: ${ev.upcoming}`)
      line(`  "Time to check" (0025 couldn't read the old time): ${ev.review} (${ev.review_upcoming} upcoming)`)
      if (ev.review_upcoming) line('  !! Open each flagged upcoming event in Admin > Events and confirm its date and time.')
      if (!ev.upcoming) line('  Add at least one real upcoming event in Admin > Events before the demo.')
    } else {
      const rows = await q(`select date, time from live_events`)
      const flagged = rows.filter((r) => eventTimeNeedsReview(r.date, r.time)).length
      line(`  Events: ${rows.length}. 0025 is pending: it will flag ${flagged} as "time to check" (kept at noon UAE time on their date).`)
    }
  }

  heading('Certificates')
  if (await exists('course_certificates')) {
    const [c] = await q(
      `select count(*)::int as total,
              count(*) filter (where certificate_url is null or certificate_url not like $1)::int as redraw
         from course_certificates`,
      [`%-v${CERT_RENDER_VERSION}.png`],
    )
    line(`  Certificates: ${c.total}; to be drawn again on the next boot: ${c.redraw}`)
    if (c.redraw) line('  The new server redraws them in the background after it starts; re-run audit a minute later: it should say 0.')
    line('  certificate-check holds each one to the issuing rules.')
  }

  heading('Points ledger')
  if (await exists('points_events')) {
    const [p] = await q(`
      with t as (
        select u.id, u.points,
               coalesce((select sum(r.points_deducted) from offer_redemptions r where r.user_id = u.id), 0) as spent,
               coalesce((select sum(e.amount) from points_events e where e.user_id = u.id), 0) as earned
          from users u)
      select count(*) filter (where points + spent = earned)::int as ok,
             count(*) filter (where points + spent > earned)::int as balance_above_ledger,
             count(*) filter (where points + spent < earned)::int as balance_below_ledger,
             count(*) filter (where points < 0)::int as negative,
             coalesce(sum(points), 0)::int as held, coalesce(sum(earned), 0)::int as earned
        from t`)
    line(`  Balance + points spent = points earned: ${p.ok} accounts`)
    line(`  Balance higher than the ledger: ${p.balance_above_ledger}; lower: ${p.balance_below_ledger}; negative balance: ${p.negative}`)
    line(`  Points held ${p.held}, earned in all ${p.earned}`)
    if (p.balance_above_ledger || p.balance_below_ledger || p.negative) line('  !! Some balances don\'t match the ledger; the leaderboard ranks by the ledger.')
  } else {
    line('  points_events not created yet (0020_points_ledger, then 0024_achievements backfills it).')
  }

  heading('AI analytics')
  const [ai] = await q(`select count(*)::int as n from pg_views where schemaname = 'ai'`)
  const [role] = await q(`select 1 as yes from pg_roles where rolname = $1`, [AI_ROLE])
  line(`  ai views: ${ai.n}${ai.n ? '' : ' (0029_ai_views creates them)'}; role ${AI_ROLE}: ${role ? 'exists' : 'not created (ai-readonly-role)'}`)

  heading('Server settings (names only, no values)')
  const required = ['NODE_ENV', 'DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'FRONTEND_URL', 'FROM_EMAIL', 'AWS_REGION', 'COPILOT_SERVICE_JWT_SECRET']
  const optional = ['FROM_NAME', 'SERVER_PUBLIC_URL', 'TRUSTED_PROXIES', 'AI_READONLY_DATABASE_URL', 'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'ZOOM_HOST_USER_ID', 'ZOOM_WEBHOOK_SECRET_TOKEN']
  for (const name of required) line(`  ${name.padEnd(28)} ${process.env[name] ? 'set' : 'MISSING'}`)
  for (const name of optional) line(`  ${name.padEnd(28)} ${process.env[name] ? 'set' : 'not set'}`)
  const secret = process.env.BETTER_AUTH_SECRET ?? ''
  if (secret && secret.length < 32) line('  !! BETTER_AUTH_SECRET is shorter than 32 characters.')
  if (!secret && process.env.NODE_ENV === 'production') line('  !! Without BETTER_AUTH_SECRET sessions are signed with JWT_SECRET, and announcement unsubscribe links fail.')
  if (process.env.NODE_ENV === 'production' && !process.env.AWS_REGION) line('  !! Production sends email through AWS SES: without AWS_REGION nobody gets a sign-in code.')
  for (const flag of ['REMINDER_EMAILS_ENABLED', 'ANNOUNCEMENT_EMAILS_ENABLED']) {
    line(`  ${flag.padEnd(28)} ${process.env[flag] === 'true' ? 'ON (learners get these emails)' : 'off'}`)
  }
  for (const flag of ['REMINDERS_ENABLED', 'ANNOUNCEMENTS_TIMER_ENABLED']) {
    line(`  ${flag.padEnd(28)} ${process.env[flag] === 'false' ? 'timer off' : 'timer on'}`)
  }
}

// ─── admins ──────────────────────────────────────────────────────────────────

const nameFrom = (email) => email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')

// Creates each admin verified and without a password: they sign in with an
// emailed code (and can set a password in Profile). Existing accounts are
// promoted. Safe to re-run.
async function setAdmins() {
  const emails = emailArgs()
  if (emails.length === 0) {
    console.error('Usage: set-admins a@x.com b@y.com [--apply]   (or --emails a@x.com,b@y.com)')
    process.exit(1)
  }
  await requireBetterAuth()
  await transaction('set-admins', async (c) => {
    for (const email of emails) {
      const { rows } = await c.query(`select id, role, email_verified from users where lower(email) = $1`, [email])
      const user = rows[0]
      if (user?.role === 'admin' && user.email_verified) {
        line(`  ${email}: already a verified admin`)
      } else if (user) {
        await c.query(`update users set role = 'admin', email_verified = true, updated_at = now() where id = $1`, [user.id])
        line(`  ${email}: existing ${user.role} account made admin${user.email_verified ? '' : ' (and marked verified)'}`)
      } else {
        await c.query(
          `insert into users (id, full_name, email, role, email_verified, legacy_account) values ($1, $2, $3, 'admin', true, false)`,
          [randomUUID(), nameFrom(email), email],
        )
        line(`  ${email}: new admin "${nameFrom(email)}" (signs in with an email code)`)
      }
    }
  })
}

// SMEEP deletes the default admin (its password and sessions go with it), after
// handing what it created to a real admin. Same here. Refuses while no other
// verified admin exists, so the site is never left without one.
async function retireDefaultAdmin() {
  await requireBetterAuth()
  const [target] = await q(`select id, role from users where lower(email) = $1`, [DEFAULT_ADMIN])
  if (!target) {
    line(`${DEFAULT_ADMIN} does not exist. Nothing to do.`)
    return
  }
  const [heir] = await q(
    `select id, email from users where role = 'admin' and email_verified and lower(email) <> $1 order by created_at limit 1`,
    [DEFAULT_ADMIN],
  )
  if (!heir) {
    console.error(`Refusing: ${DEFAULT_ADMIN} is the only admin. Run set-admins --apply first, then sign in as one of them once.`)
    process.exitCode = 1
    return
  }
  // Rows that point at the default admin. media_files cascades (the uploads
  // would vanish from the library); the others would lose their author.
  const owned = [
    ['media_files', 'uploaded_by'],
    ['live_events', 'created_by'],
    ['invite_codes', 'created_by'],
    ['announcements', 'created_by'],
    ['ai_dashboards', 'created_by'],
    ['ai_report_notes', 'admin_id'],
    ['ai_reports', 'reviewed_by'],
  ]
  await transaction('retire-default-admin', async (c) => {
    for (const [table, column] of owned) {
      if (!(await exists(table, column))) continue
      const r = await c.query(`update ${table} set ${column} = $1 where ${column} = $2`, [heir.id, target.id])
      line(`  ${table}.${column}: ${r.rowCount} row(s) handed to ${heir.email}`)
    }
    const s = await c.query(`select count(*)::int as n from mentor_sessions where mentor_user_id = $1 or sme_user_id = $1`, [target.id])
    if (s.rows[0].n) throw new Error(`${DEFAULT_ADMIN} has ${s.rows[0].n} mentor session(s); resolve them first.`)
    const d = await c.query(`delete from users where id = $1`, [target.id])
    line(`  ${DEFAULT_ADMIN} (${target.role}): ${d.rowCount ? 'deleted, with its password, sessions and progress' : 'not found'}`)
  })
}

// Accounts whose mailbox can't receive a sign-in code. Marking them verified
// lets them keep signing in with their password; otherwise the first sign-in
// after the release asks for a code they would never get.
async function verifyAccounts() {
  const [domain] = flagList('--domain')
  const emails = emailArgs()
  if (emails.length === 0 && !domain) {
    console.error('Usage: verify-accounts --domain example.org | a@x.com b@y.com [--apply]')
    process.exit(1)
  }
  await requireBetterAuth()
  await transaction('verify-accounts', async (c) => {
    const { rows } = domain
      ? await c.query(`select id, lower(email) as email, role, email_verified from users where split_part(lower(email), '@', 2) = $1`, [domain])
      : await c.query(`select id, lower(email) as email, role, email_verified from users where lower(email) = any($1)`, [emails])
    // With --domain, counts by role only (no addresses); with emails, each one typed.
    if (!domain) {
      for (const email of emails) {
        const r = rows.find((x) => x.email === email)
        line(`  ${email}: ${!r ? 'not found' : r.email_verified ? `already verified (${r.role})` : `marked verified (${r.role})`}`)
      }
    }
    const todo = rows.filter((r) => !r.email_verified)
    if (todo.length) await c.query(`update users set email_verified = true, updated_at = now() where id = any($1)`, [todo.map((r) => r.id)])
    if (domain) {
      const byRole = {}
      for (const r of todo) byRole[r.role] = (byRole[r.role] ?? 0) + 1
      line(`  @${domain}: ${rows.length} account(s), ${rows.length - todo.length} already verified`)
      for (const [role, n] of Object.entries(byRole)) line(`    ${role}: ${n} marked verified`)
    }
    line(`  ${todo.length} of ${rows.length} account(s) changed`)
  })
}

// ─── AI analytics read-only role (scripts/ai-readonly-role.mjs) ──────────────

async function aiReadonlyRole() {
  const result = await transaction('ai-readonly-role', (c) => ensureAiReadonlyRole(c, { newPassword, log: line }))
  if (!result.password) return
  if (!apply) {
    line('\n  With --apply this prints the AI_READONLY_DATABASE_URL to set on the Hadafi server.')
    return
  }
  line('\nSet this on the Hadafi server in Dokploy, redeploy, then run ai-readonly-check:')
  line(`\n  AI_READONLY_DATABASE_URL=${aiReadonlyUrl(process.env.DATABASE_URL, result.password)}\n`)
  line('  It is shown once. If it is lost, re-run with --new-password --apply.')
}

async function aiReadonlyCheck() {
  const url = (process.env.AI_READONLY_DATABASE_URL ?? '').trim()
  if (!url) {
    console.error('AI_READONLY_DATABASE_URL is not set on this server. Run ai-readonly-role --apply, set it in Dokploy, redeploy.')
    process.exitCode = 1
    return
  }
  heading('Read-only role check')
  const failed = await checkAiReadonlyRole(url, line)
  line(failed ? `\n${failed} check(s) FAILED: fix the role before relying on it.` : '\nAll checks passed: AI queries run as a role that can only read the ai views.')
  if (failed) process.exitCode = 1
}

// ─── certificate check ───────────────────────────────────────────────────────
// Holds every certificate to today's issuing rules (canIssueCertificate in
// server/services/lms/certificate.service.ts): certificate enabled, enrolled,
// 100% progress, final exam passed (or taken, if ungraded). Prints the
// certificate number, course and date, never names or emails; look a learner
// up in the admin pages by certificate number if needed.

async function certificateCheck() {
  heading("Certificates against today's rules")
  const rows = await q(`
    select cc.certificate_number, cc.issued_at, c.title as course, c.status as course_status,
           c.enable_certificate,
           exists (select 1 from course_enrollments e where e.user_id = cc.user_id and e.course_id = cc.course_id) as enrolled,
           coalesce((select max(p.progress_percentage) from user_course_progress p
                     where p.user_id = cc.user_id and p.course_id = cc.course_id), 0) as progress,
           post.id is not null as has_final, post.is_graded,
           exists (select 1 from assessment_attempts a where a.user_id = cc.user_id and a.assessment_id = post.id and a.passed = true) as passed,
           exists (select 1 from assessment_attempts a where a.user_id = cc.user_id and a.assessment_id = post.id) as attempted,
           (cc.certificate_url is null or cc.certificate_url not like $1) as needs_redraw
      from course_certificates cc
      join courses c on c.id = cc.course_id
      left join lateral (
        select id, is_graded from assessments
         where course_id = cc.course_id and assessment_type = 'post' limit 1
      ) post on true
     order by cc.issued_at`, [`%-v${CERT_RENDER_VERSION}.png`])
  const problems = []
  for (const r of rows) {
    const why = []
    if (!r.enable_certificate) why.push('course gives no certificate')
    if (r.course_status !== 'published') why.push(`course is ${r.course_status}`)
    if (!r.enrolled) why.push('not enrolled')
    if (Number(r.progress) < 100) why.push(`progress ${r.progress}%`)
    if (r.has_final && r.is_graded && !r.passed) why.push('final exam not passed')
    if (r.has_final && !r.is_graded && !r.attempted) why.push('final exam not taken')
    if (why.length) problems.push({ ...r, why })
  }
  const redraw = rows.filter((r) => r.needs_redraw).length
  line(`  ${rows.length} certificates in total, ${rows.length - problems.length} meet today's rules; ${redraw} still to be drawn with the current template.`)
  if (!problems.length) {
    line('  OK: no certificate was issued without being earned.')
    return
  }
  line(`  !! ${problems.length} do not:`)
  for (const p of problems) {
    line(`    ${p.certificate_number}  ${new Date(p.issued_at).toISOString().slice(0, 10)}  ${String(p.course).trim()}  (${p.why.join(', ')})`)
  }
  line('  Older certificates may predate these rules (a course without a final exam then); check those by hand.')
}

const commands = {
  audit,
  'set-admins': setAdmins,
  'retire-default-admin': retireDefaultAdmin,
  'verify-accounts': verifyAccounts,
  'ai-readonly-role': aiReadonlyRole,
  'ai-readonly-check': aiReadonlyCheck,
  'certificate-check': certificateCheck,
}
if (!commands[command]) {
  console.error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(', ')}`)
  process.exit(1)
}
try {
  await commands[command]()
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
