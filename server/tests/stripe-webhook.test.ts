import { describe, it, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import type Stripe from 'stripe'
import { db } from '../db'
import { offers, offerRedemptions, users } from '../db/schema'
import { stripe } from '../config/stripe'
import * as mailer from '../mail/mailer'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Paid offers: Stripe's signed `payment_intent.succeeded` webhook records the
 * order when the learner's browser never calls /complete, through the same
 * path as /complete (one order per intent, whichever comes first, metadata
 * checked). Creating payment intents is rate limited per learner.
 */

const SECRET = 'whsec_test_hadafi_webhook_secret'
const PRICE = 2500
const COST = 10
let base = ''
let learner: TestUser
let other: TestUser
const offerIds: string[] = []
let paidOffer = ''
let freeOffer = ''
const savedSecret = process.env['STRIPE_WEBHOOK_SECRET']
let mailSpy: ReturnType<typeof spyOn>
const sent: string[] = []

async function makeOffer(title: string, price: number): Promise<string> {
  const [o] = await db.insert(offers).values({
    title, slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${crypto.randomUUID().slice(0, 8)}`,
    category: 'AI', priceLabel: price ? '$25' : 'Free', price, pointsCost: COST, status: 'published',
  }).returning()
  offerIds.push(o!.id)
  return o!.id
}

const intent = (over: Partial<Stripe.PaymentIntent> & { metadata?: Record<string, string> } = {}) => ({
  id: `pi_test_${crypto.randomUUID().replace(/-/g, '')}`,
  object: 'payment_intent',
  amount: PRICE,
  currency: 'usd',
  status: 'succeeded',
  metadata: { offerId: paidOffer, userId: learner.id, platform: 'hadafi' },
  ...over,
}) as unknown as Stripe.PaymentIntent

const eventFor = (pi: Stripe.PaymentIntent, type = 'payment_intent.succeeded') => JSON.stringify({
  id: `evt_test_${crypto.randomUUID().slice(0, 8)}`, object: 'event', type, api_version: '2026-04-22.dahlia',
  created: Math.floor(Date.now() / 1000), livemode: false, data: { object: pi },
})

async function deliver(payload: string, opts: { secret?: string; signature?: string | null } = {}) {
  const signature = opts.signature === undefined
    ? await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: opts.secret ?? SECRET })
    : opts.signature
  return fetch(`${base}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(signature !== null ? { 'Stripe-Signature': signature } : {}) },
    body: payload,
  })
}

const ordersFor = (piId: string) => db.select().from(offerRedemptions).where(eq(offerRedemptions.stripePaymentIntentId, piId))
const pointsOf = async (id: string) => (await db.select({ p: users.points }).from(users).where(eq(users.id, id)))[0]!.p

beforeAll(async () => {
  base = await startTestServer()
  process.env['STRIPE_WEBHOOK_SECRET'] = SECRET
  learner = await createTestUser('stripe-learner')
  other = await createTestUser('stripe-other')
  await db.update(users).set({ points: 100 }).where(inArray(users.id, [learner.id, other.id]))
  paidOffer = await makeOffer('E2E paid offer', PRICE)
  freeOffer = await makeOffer('E2E free offer', 0)
  mailSpy = spyOn(mailer, 'sendMail').mockImplementation(async (opts) => {
    sent.push(opts.to)
  })
})

afterEach(() => {
  process.env['STRIPE_WEBHOOK_SECRET'] = SECRET
})

afterAll(async () => {
  mailSpy.mockRestore()
  if (savedSecret === undefined) delete process.env['STRIPE_WEBHOOK_SECRET']
  else process.env['STRIPE_WEBHOOK_SECRET'] = savedSecret
  await db.delete(offers).where(inArray(offers.id, offerIds))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('the Stripe webhook signature', () => {
  it('is required: none, a wrong one, or one made with another secret is a 400', async () => {
    const payload = eventFor(intent())
    expect((await deliver(payload, { signature: null })).status).toBe(400)
    expect((await deliver(payload, { signature: 't=1,v1=deadbeef' })).status).toBe(400)
    expect((await deliver(payload, { secret: 'whsec_someone_else' })).status).toBe(400)
  })

  it('a body changed after signing is a 400', async () => {
    const pi = intent()
    const payload = eventFor(pi)
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: SECRET })
    const tampered = payload.replace(String(PRICE), '1')
    expect((await deliver(tampered, { signature })).status).toBe(400)
    expect(await ordersFor(pi.id)).toHaveLength(0)
  })

  it('without STRIPE_WEBHOOK_SECRET the endpoint is off (503) and records nothing', async () => {
    delete process.env['STRIPE_WEBHOOK_SECRET']
    const pi = intent()
    expect((await deliver(eventFor(pi))).status).toBe(503)
    expect(await ordersFor(pi.id)).toHaveLength(0)
  })

  it('needs no Origin (the site Origin check does not apply to it)', async () => {
    const res = await deliver(eventFor(intent({ metadata: {} })))
    expect(res.status).toBe(200)
  })
})

describe('payment_intent.succeeded', () => {
  it('records the order once, deducting points once, however often Stripe sends it', async () => {
    const before = await pointsOf(learner.id)
    const pi = intent()
    const payload = eventFor(pi)
    expect((await deliver(payload)).status).toBe(200)
    expect((await deliver(payload)).status).toBe(200)
    expect((await deliver(eventFor(pi))).status).toBe(200)
    const rows = await ordersFor(pi.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: learner.id, offerId: paidOffer, amountCharged: PRICE, pointsDeducted: COST, orderStatus: 'paid' })
    expect(await pointsOf(learner.id)).toBe(before - COST)
    expect(sent.filter((to) => to === learner.email).length).toBeGreaterThanOrEqual(1)
  })

  it('then /complete for the same intent returns the same order and adds the billing details', async () => {
    const pi = intent()
    expect((await deliver(eventFor(pi))).status).toBe(200)
    const before = await pointsOf(learner.id)
    const retrieve = spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(pi as never)
    try {
      const res = await api<{ data: { pointsDeducted: number } }>('POST', `/api/offers/${paidOffer}/complete`, {
        token: learner.token, body: { paymentIntentId: pi.id, billingFirstName: 'Layla', billingCompany: 'Layla Crafts' },
      })
      expect(res.status).toBe(200)
      expect(res.body.data.pointsDeducted).toBe(COST)
    } finally {
      retrieve.mockRestore()
    }
    const rows = await ordersFor(pi.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ billingFirstName: 'Layla', billingCompany: 'Layla Crafts' })
    expect(await pointsOf(learner.id)).toBe(before)
  })

  it('/complete first, then the webhook: still one order', async () => {
    const pi = intent()
    const before = await pointsOf(learner.id)
    const retrieve = spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(pi as never)
    try {
      expect((await api('POST', `/api/offers/${paidOffer}/complete`, { token: learner.token, body: { paymentIntentId: pi.id } })).status).toBe(200)
    } finally {
      retrieve.mockRestore()
    }
    expect((await deliver(eventFor(pi))).status).toBe(200)
    expect(await ordersFor(pi.id)).toHaveLength(1)
    expect(await pointsOf(learner.id)).toBe(before - COST)
  })

  it("/complete can't claim another learner's payment", async () => {
    const pi = intent({ metadata: { offerId: paidOffer, userId: other.id, platform: 'hadafi' } })
    const retrieve = spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(pi as never)
    try {
      const res = await api<{ error: { code: string } }>('POST', `/api/offers/${paidOffer}/complete`, { token: learner.token, body: { paymentIntentId: pi.id } })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('PAYMENT_MISMATCH')
    } finally {
      retrieve.mockRestore()
    }
    expect(await ordersFor(pi.id)).toHaveLength(0)
  })

  it('ignores intents that are not offer payments, and other events', async () => {
    const plain = intent({ metadata: {} })
    expect((await deliver(eventFor(plain))).status).toBe(200)
    const other = intent()
    expect((await deliver(eventFor(other, 'payment_intent.created'))).status).toBe(200)
    expect([...(await ordersFor(plain.id)), ...(await ordersFor(other.id))]).toHaveLength(0)
  })

  it("leaves other sites' payments on the shared Stripe account alone, even with offer-like metadata", async () => {
    // e.g. another Potential app's payment that happens to carry these keys.
    const foreign = intent({ metadata: { offerId: paidOffer, userId: learner.id } })
    const tagged = intent({ metadata: { offerId: paidOffer, userId: learner.id, platform: 'smeep' } })
    expect((await deliver(eventFor(foreign))).status).toBe(200)
    expect((await deliver(eventFor(tagged))).status).toBe(200)
    expect([...(await ordersFor(foreign.id)), ...(await ordersFor(tagged.id))]).toHaveLength(0)
  })

  it('refuses bad metadata (not a real offer/learner id) without recording, and stops Stripe retrying', async () => {
    const pi = intent({ metadata: { offerId: 'not-a-uuid', userId: learner.id, platform: 'hadafi' } })
    expect((await deliver(eventFor(pi))).status).toBe(200)
    expect(await ordersFor(pi.id)).toHaveLength(0)
  })

  it("doesn't record (or overdraw) when the learner no longer has the points", async () => {
    const poor = await createTestUser('stripe-poor')
    await db.update(users).set({ points: COST - 1 }).where(eq(users.id, poor.id))
    const pi = intent({ metadata: { offerId: paidOffer, userId: poor.id, platform: 'hadafi' } })
    expect((await deliver(eventFor(pi))).status).toBe(200)
    expect(await ordersFor(pi.id)).toHaveLength(0)
    expect(await pointsOf(poor.id)).toBe(COST - 1)
  })

  it('an intent that has not succeeded records nothing', async () => {
    const pi = intent({ status: 'processing' })
    expect((await deliver(eventFor(pi))).status).toBe(200)
    expect(await ordersFor(pi.id)).toHaveLength(0)
  })
})

describe('creating payment intents', () => {
  it('is limited to 10 an hour per learner', async () => {
    const buyer = await createTestUser('stripe-limit')
    await db.update(users).set({ points: 1000 }).where(eq(users.id, buyer.id))
    // A free offer answers without calling Stripe; the limit counts every call.
    for (let i = 0; i < 10; i++) {
      expect((await api('POST', `/api/offers/${freeOffer}/payment-intent`, { token: buyer.token, body: {} })).status).toBe(200)
    }
    const res = await api<{ error: { code: string } }>('POST', `/api/offers/${freeOffer}/payment-intent`, { token: buyer.token, body: {} })
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('RATE_LIMITED')
    // Another learner has their own budget.
    expect((await api('POST', `/api/offers/${freeOffer}/payment-intent`, { token: other.token, body: {} })).status).toBe(200)
  })
})
