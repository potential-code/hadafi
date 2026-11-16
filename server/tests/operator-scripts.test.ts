import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import crypto from 'node:crypto'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users, authAccounts } from '../db/schema'
import { cleanupFixtureUsers, createTestUser, fixtureEmail, startTestServer, stopTestServer } from './helpers'

/**
 * scripts/create-operator-user.mjs and scripts/generate-operator-key.mjs,
 * run the way an operator runs them (node, in the server folder).
 */

const serverDir = path.resolve(import.meta.dir, '..')

function run(script: string, args: string[], env: Record<string, string | undefined> = {}) {
  const out = Bun.spawnSync(['node', `scripts/${script}`, ...args], {
    cwd: serverDir,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return { code: out.exitCode, stdout: out.stdout.toString(), stderr: out.stderr.toString() }
}

const findUser = async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0]

beforeAll(async () => {
  await startTestServer()
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('generate-operator-key', () => {
  it('prints a new key and the label:sha256 line that matches it', () => {
    const { code, stdout } = run('generate-operator-key.mjs', ['--label', 'maya-demo', '--allow-non-tty'])
    expect(code).toBe(0)
    const key = stdout.match(/hadafi_op_[A-Za-z0-9_-]{40,}/)?.[0]
    expect(key).toBeDefined()
    const entry = stdout.match(/maya-demo:([0-9a-f]{64})/)
    expect(entry?.[1]).toBe(crypto.createHash('sha256').update(key!).digest('hex'))
  })

  it('makes a different key every time', () => {
    const a = run('generate-operator-key.mjs', ['--label', 'x', '--allow-non-tty']).stdout
    const b = run('generate-operator-key.mjs', ['--label', 'x', '--allow-non-tty']).stdout
    expect(a).not.toBe(b)
  })

  it('refuses to print a key into a pipe or log unless asked', () => {
    const { code, stdout } = run('generate-operator-key.mjs', ['--label', 'maya-demo'])
    expect(code).not.toBe(0)
    expect(stdout).not.toMatch(/hadafi_op_/)
  })

  it('needs a valid label', () => {
    expect(run('generate-operator-key.mjs', ['--allow-non-tty']).code).not.toBe(0)
    expect(run('generate-operator-key.mjs', ['--label', 'bad label!', '--allow-non-tty']).code).not.toBe(0)
  })
})

describe('create-operator-user', () => {
  it('previews without --apply and changes nothing', async () => {
    const email = fixtureEmail('maya-script')
    const { code, stdout } = run('create-operator-user.mjs', ['--email', email])
    expect(code).toBe(0)
    expect(stdout).toContain('preview')
    expect(await findUser(email)).toBeUndefined()
  })

  it('creates the admin service user with no way to sign in, then is idempotent', async () => {
    const email = fixtureEmail('maya-script')
    const first = run('create-operator-user.mjs', ['--apply'], { OPERATOR_SERVICE_USER_EMAIL: email })
    expect(first.code).toBe(0)
    const user = await findUser(email)
    expect(user).toBeDefined()
    expect(user!.role).toBe('admin')
    expect(user!.fullName).toBe('Maya (AI operator)')
    expect(user!.emailVerified).toBe(false)
    // No credential (password) account: nothing to sign in with.
    expect(await db.select().from(authAccounts).where(eq(authAccounts.userId, user!.id))).toHaveLength(0)

    const second = run('create-operator-user.mjs', ['--apply', '--email', email.toUpperCase()])
    expect(second.code).toBe(0)
    expect(second.stdout).toContain('already')
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(1)
  })

  it('refuses to promote an existing non-admin account', async () => {
    const learner = await createTestUser('script-learner')
    const { code } = run('create-operator-user.mjs', ['--apply', '--email', learner.email])
    expect(code).not.toBe(0)
    expect((await findUser(learner.email))!.role).toBe('sme')
  })

  it('refuses an existing admin that can sign in (a person, not a service account)', async () => {
    const person = await createTestUser('script-admin', 'admin')
    const { code } = run('create-operator-user.mjs', ['--apply', '--email', person.email])
    expect(code).not.toBe(0)
  })

  it('refuses an admin with no sign-in that is not the operator account (another name)', async () => {
    const email = fixtureEmail('script-other-admin')
    await db.insert(users).values({ fullName: 'Someone Else', email, role: 'admin' })
    const { code, stdout, stderr } = run('create-operator-user.mjs', ['--apply', '--email', email])
    expect(code).not.toBe(0)
    expect(stdout).not.toContain('already set up')
    expect(stderr).toContain('Someone Else')
    expect((await findUser(email))!.fullName).toBe('Someone Else')
  })

  it('needs an email', () => {
    expect(run('create-operator-user.mjs', [], { OPERATOR_SERVICE_USER_EMAIL: '' }).code).not.toBe(0)
  })
})
