import { describe, it, expect, beforeAll, afterAll, spyOn } from 'bun:test'
import { like } from 'drizzle-orm'
import { db } from '../db'
import { mentorRegistrations, stakeholderRegistrations } from '../db/schema'
import * as mailer from '../mail/mailer'
import { plainName } from '../utils/plainName'
import { confirmationName } from '../services/stakeholders.service'
import { startTestServer, stopTestServer, api, RUN_ID } from './helpers'

/**
 * The public mentor and organisation application forms: 5 an hour per
 * visitor address (both forms together, as SMEEP), and the name typed in
 * goes into the confirmation email as plain words, never as a link.
 */

const domain = `forms-${RUN_ID}.e2e.local`
const sent: Array<{ to: string; context: Record<string, unknown> }> = []
let mailSpy: ReturnType<typeof spyOn>

beforeAll(async () => {
  await startTestServer()
  mailSpy = spyOn(mailer, 'sendMail').mockImplementation(async (opts) => {
    sent.push({ to: opts.to, context: opts.context })
  })
})

afterAll(async () => {
  mailSpy.mockRestore()
  await db.delete(mentorRegistrations).where(like(mentorRegistrations.email, `%@${domain}`))
  await db.delete(stakeholderRegistrations).where(like(stakeholderRegistrations.email, `%@${domain}`))
  await stopTestServer()
})

const expert = (name: string, n: number) => ({
  name,
  email: `mentor${n}@${domain}`,
  linkedin: 'https://www.linkedin.com/in/someone',
  hourlyRate: 100,
  expertise: ['Marketing'],
  methods: ['Online'],
  passion: 'Helping founders.',
})

const organisation = (n: number) => ({
  type: 'corporate',
  fullName: 'Org Person',
  title: 'Director',
  email: `org${n}@${domain}`,
  country: 'AE',
  website: 'https://example.org',
  phone: '+971500000000',
  representing: 'Example Org',
  involvement: ['Partnership'],
})

describe('plainName', () => {
  it('keeps ordinary names as they are', () => {
    for (const name of ["Layla Haddad", "Seán O'Brien-Smith", 'J. R. Tolkien', 'ليلى حداد', 'Dr. Ahmed Al Mansoori']) {
      expect(plainName(name)).toBe(name)
    }
  })

  it('drops links, addresses and domain-like words', () => {
    expect(plainName('Ahmed https://evil.example/pay now')).toBe('Ahmed now')
    expect(plainName('Ahmed visit evil.example/pay')).toBe('Ahmed visit')
    expect(plainName('Win bit.ly prize')).toBe('Win prize')
    expect(plainName('Sara www.evil.example')).toBe('Sara')
    expect(plainName('Sara javascript:alert(1)')).toBe('Sara')
    expect(plainName('Sara mail@evil.example')).toBe('Sara')
    // Full-width dot and slash normalise to the ASCII ones first.
    expect(plainName(`Sara evil${String.fromCodePoint(0xff0e)}example`)).toBe('Sara')
  })

  it('drops markup and invisible characters', () => {
    expect(plainName('<a href="https://evil.example">Click</a> Mona')).toBe('Click Mona')
    expect(plainName('<img src=x onerror=alert(1)>Mona')).toBe('Mona')
    expect(plainName('[Claim your prize](https://evil.example) Mona')).toBe('Claim your prize Mona')
    expect(plainName(`Mo${String.fromCodePoint(0x202e)}na${String.fromCodePoint(0x200b)}`)).toBe('Mona')
  })

  it('a name that was only a link greets "there"', () => {
    expect(confirmationName('https://evil.example')).toBe('there')
    expect(confirmationName('Layla')).toBe('Layla')
  })
})

describe('the mentor application form', () => {
  it('emails the plain name, without the link typed into it', async () => {
    const res = await api('POST', '/api/stakeholders/expert', { body: expert('Mona <b>visit</b> https://evil.example/pay', 1) })
    expect(res.status).toBe(201)
    const mail = sent.find((m) => m.to === `mentor1@${domain}`)
    expect(mail?.context['name']).toBe('Mona visit')
  })
})

describe('both forms together', () => {
  it('allow 5 applications an hour per visitor address, then 429', async () => {
    // One already sent above; four more of either form are accepted.
    for (let n = 2; n <= 3; n++) expect((await api('POST', '/api/stakeholders/expert', { body: expert('Mentor', n) })).status).toBe(201)
    for (let n = 1; n <= 2; n++) expect((await api('POST', '/api/stakeholders/organisation', { body: organisation(n) })).status).toBe(201)
    const sixth = await api<{ error: { code: string } }>('POST', '/api/stakeholders/organisation', { body: organisation(3) })
    expect(sixth.status).toBe(429)
    expect(sixth.body.error.code).toBe('RATE_LIMITED')
    expect((await api('POST', '/api/stakeholders/expert', { body: expert('Mentor', 9) })).status).toBe(429)
  })
})
