import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import jwt from 'jsonwebtoken'
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '../db'
import { courses, modules, units, learningBlocks, assessments, assessmentQuestions, courseEnrollments, tutorTranslations } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, RUN_ID, type TestUser } from './helpers'
import { resetTranslationMemory } from '../services/tutorTranslation.service'

/**
 * Learn with Hana in Arabic and Urdu (ported from SMEEP's tutor languages).
 *
 * Course content is translated on the server through potential-ai's
 * /api/learning/translate with a server token, once per string per language,
 * and kept in tutor_translations. Only enrolled learners get translated cards,
 * nothing is translated for a course they can't see, and the language is a
 * whitelist (en, ar, ur): anything else is English and costs no call.
 *
 * potential-ai is stood in for by a fetch stub on a fake host; every other
 * request (the test's own calls to the API) passes through.
 */

const AI = 'http://potential-ai.test'
const TAG = `L10n ${RUN_ID}`
type Call = { texts: string[]; targetLang: string; domain: string; claims: Record<string, unknown> }
const calls: Call[] = []
let failNext = false

const PREFIX: Record<string, string> = { ar: 'ترجمة', hi: 'अनुवाद', ur: 'ترجمہ' }

const realFetch = globalThis.fetch
const saved = { base: process.env['NEXT_PUBLIC_AI_BACKEND_URL'], secret: process.env['COPILOT_SERVICE_JWT_SECRET'] }
let secret = ''

let learner: TestUser
let outsider: TestUser
const ids = { course: '', draft: '', other: '', unit: '', otherUnit: '', video: '', pre: '', preQ: '', otherPre: '' }

type Res<T = unknown> = { success: boolean; data: T; error?: { code: string } }
type State = {
  language: string
  courses: Array<{ courseId: string; name: string }>
  active: null | { name: string; units: Array<{ name: string; moduleName: string }>; preTest: null | { title: string } }
}

const get = <T,>(u: TestUser | null, path: string) => api<Res<T>>('GET', path, u ? { token: u.token } : {})

beforeAll(async () => {
  secret = saved.secret || 'tutor-translation-test-secret'
  process.env['NEXT_PUBLIC_AI_BACKEND_URL'] = AI
  process.env['COPILOT_SERVICE_JWT_SECRET'] = secret
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith(AI)) return realFetch(input, init)
    expect(url).toBe(`${AI}/api/learning/translate`)
    const token = String((init?.headers as Record<string, string>)['Authorization']).replace(/^Bearer /, '')
    const body = JSON.parse(String(init?.body)) as Omit<Call, 'claims'>
    calls.push({ ...body, claims: jwt.verify(token, secret) as Record<string, unknown> })
    if (failNext) return new Response('{"success":false}', { status: 500 })
    const translations = body.texts.map((t) => `${PREFIX[body.targetLang] ?? '??'}: ${t}`)
    return new Response(JSON.stringify({ success: true, data: { translations } }), { headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  await startTestServer()
  learner = await createTestUser('tutor-lang')
  outsider = await createTestUser('tutor-lang-outsider')

  const [course] = await db.insert(courses).values({ title: `${TAG} course`, status: 'published' }).returning()
  const [draft] = await db.insert(courses).values({ title: `${TAG} draft course`, status: 'draft' }).returning()
  const [other] = await db.insert(courses).values({ title: `${TAG} other course`, status: 'published' }).returning()
  ids.course = course!.id
  ids.draft = draft!.id
  ids.other = other!.id
  const [mod] = await db.insert(modules).values({ courseId: ids.course, title: `${TAG} module` }).returning()
  const [unit] = await db
    .insert(units)
    .values({ moduleId: mod!.id, title: `${TAG} unit`, description: `${TAG} unit description`, order: 0 })
    .returning()
  ids.unit = unit!.id
  const blocks = await db
    .insert(learningBlocks)
    .values([
      { unitId: ids.unit, type: 'text', title: 'Welcome', body: `<p>${TAG} opening text</p>`, order: 0 },
      { unitId: ids.unit, type: 'video', title: `${TAG} video`, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', order: 1 },
    ])
    .returning()
  ids.video = blocks[1]!.id
  const [pre] = await db
    .insert(assessments)
    .values({ courseId: ids.course, title: `${TAG} pre-test`, assessmentType: 'pre', isGraded: true, passingScore: 50 })
    .returning()
  ids.pre = pre!.id
  const [preQ] = await db
    .insert(assessmentQuestions)
    .values({ assessmentId: ids.pre, questionText: `${TAG} question`, options: [`${TAG} wrong`, `${TAG} right`], correctAnswer: 1 })
    .returning()
  ids.preQ = preQ!.id

  // A course the learner is NOT enrolled in, with content of its own.
  const [oMod] = await db.insert(modules).values({ courseId: ids.other, title: `${TAG} other module` }).returning()
  const [oUnit] = await db.insert(units).values({ moduleId: oMod!.id, title: `${TAG} secret unit` }).returning()
  ids.otherUnit = oUnit!.id
  await db.insert(learningBlocks).values({ unitId: ids.otherUnit, type: 'text', title: 'Welcome', body: `<p>${TAG} secret text</p>` })
  const [oPre] = await db
    .insert(assessments)
    .values({ courseId: ids.other, title: `${TAG} secret pre-test`, assessmentType: 'pre' })
    .returning()
  ids.otherPre = oPre!.id
  await db.insert(assessmentQuestions).values({ assessmentId: ids.otherPre, questionText: `${TAG} secret question`, options: ['A', 'B'], correctAnswer: 0 })

  await db.insert(courseEnrollments).values([
    { userId: learner.id, courseId: ids.course },
    { userId: learner.id, courseId: ids.draft },
  ])
})

afterAll(async () => {
  globalThis.fetch = realFetch
  if (saved.base === undefined) delete process.env['NEXT_PUBLIC_AI_BACKEND_URL']
  else process.env['NEXT_PUBLIC_AI_BACKEND_URL'] = saved.base
  if (saved.secret === undefined) delete process.env['COPILOT_SERVICE_JWT_SECRET']
  else process.env['COPILOT_SERVICE_JWT_SECRET'] = saved.secret
  await db.delete(tutorTranslations).where(like(tutorTranslations.source, `%${TAG}%`))
  await db.delete(courses).where(inArray(courses.id, [ids.course, ids.draft, ids.other]))
  await cleanupFixtureUsers()
  await stopTestServer()
  resetTranslationMemory()
})

beforeEach(() => {
  calls.length = 0
  failNext = false
})

const sentTexts = () => calls.flatMap((c) => c.texts).join('\n')

describe('Tutor languages: only enrolled learners', () => {
  it('needs a session', async () => {
    const res = await get(null, `/api/multi-learning/state?lang=ar`)
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it("translates nothing for a course the learner isn't enrolled in", async () => {
    expect((await get(outsider, `/api/multi-learning/state?courseId=${ids.course}&lang=ar`)).status).toBe(404)
    expect((await get(outsider, `/api/multi-learning/units/${ids.unit}/intro?lang=ar`)).status).toBe(404)
    expect((await get(outsider, `/api/multi-learning/videos/${ids.video}?lang=ar`)).status).toBe(404)
    expect((await get(outsider, `/api/multi-learning/quizzes/${ids.pre}?lang=ur`)).status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it("can't be pointed at another course's content, or a draft", async () => {
    expect((await get(learner, `/api/multi-learning/state?courseId=${ids.other}&lang=ar`)).status).toBe(404)
    expect((await get(learner, `/api/multi-learning/state?courseId=${ids.draft}&lang=ar`)).status).toBe(404)
    expect((await get(learner, `/api/multi-learning/units/${ids.otherUnit}/intro?lang=ar`)).status).toBe(404)
    expect((await get(learner, `/api/multi-learning/quizzes/${ids.otherPre}?lang=ar`)).status).toBe(404)
    expect(sentTexts()).not.toContain('secret')
    expect(sentTexts()).not.toContain('draft course')
  })
})

describe('Tutor languages: translated cards for an enrolled learner', () => {
  it('serves the course state in Arabic, through a server token for hadafi', async () => {
    const res = await get<State>(learner, `/api/multi-learning/state?courseId=${ids.course}&lang=ar`)
    expect(res.status).toBe(200)
    const s = res.body.data
    expect(s.language).toBe('ar')
    expect(s.courses.find((c) => c.courseId === ids.course)?.name).toBe(`ترجمة: ${TAG} course`)
    expect(s.active?.units[0]?.name).toBe(`ترجمة: ${TAG} unit`)
    expect(s.active?.units[0]?.moduleName).toBe(`ترجمة: ${TAG} module`)
    expect(s.active?.preTest?.title).toBe(`ترجمة: ${TAG} pre-test`)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(c.targetLang).toBe('ar')
      expect(['catalogue', 'lesson']).toContain(c.domain)
      expect(c.claims['platformId']).toBe('hadafi')
      expect(c.claims['scope']).toBe('server')
    }
    // Only the learner's own published courses were sent.
    expect(sentTexts()).not.toContain('secret')
    expect(sentTexts()).not.toContain('draft course')
  })

  it('serves an Urdu exam with translated options, still marked by position', async () => {
    const res = await get<{ questions: Array<{ questionId: string; text: string; options: string[] }> }>(
      learner,
      `/api/multi-learning/quizzes/${ids.pre}?lang=ur`,
    )
    expect(res.status).toBe(200)
    const q = res.body.data.questions[0]!
    expect(q.text).toBe(`ترجمہ: ${TAG} question`)
    expect(q.options).toEqual([`ترجمہ: ${TAG} wrong`, `ترجمہ: ${TAG} right`])
    expect(JSON.stringify(res.body)).not.toContain('correct')
    expect(calls.every((c) => c.targetLang === 'ur')).toBe(true)
  })

  it('serves Hindi, left to right in Devanagari, through the same translation path', async () => {
    calls.length = 0
    const res = await get<{ title: string; introduction: string }>(learner, `/api/multi-learning/units/${ids.unit}/intro?lang=hi`)
    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe(`अनुवाद: ${TAG} unit`)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c.targetLang === 'hi')).toBe(true)
    const state = await get<State>(learner, `/api/multi-learning/state?courseId=${ids.course}&lang=hi`)
    expect(state.body.data.language).toBe('hi')
  })

  it('translates the unit introduction, but the material Hana loads stays English', async () => {
    const intro = await get<{ title: string; introduction: string }>(learner, `/api/multi-learning/units/${ids.unit}/intro?lang=ar`)
    expect(intro.status).toBe(200)
    expect(intro.body.data.title).toBe(`ترجمة: ${TAG} unit`)
    expect(intro.body.data.introduction).toBe(`ترجمة: ${TAG} opening text`)
    calls.length = 0
    const material = await get<{ title: string }>(learner, `/api/multi-learning/units/${ids.unit}/material?lang=ar`)
    expect(material.status).toBe(200)
    expect(material.body.data.title).toBe(`${TAG} unit`)
    expect(calls).toHaveLength(0)
  })
})

describe('Tutor languages: the cache', () => {
  it('translates each string once, then serves it from memory and from tutor_translations', async () => {
    // Everything below was translated by the tests above: no new calls.
    const state = await get<State>(learner, `/api/multi-learning/state?courseId=${ids.course}&lang=ar`)
    expect(state.body.data.active?.units[0]?.name).toBe(`ترجمة: ${TAG} unit`)
    const again = await get<{ title: string }>(learner, `/api/multi-learning/videos/${ids.video}?lang=ar`)
    expect(again.body.data.title).toBe(`ترجمة: ${TAG} video`)
    expect(calls).toHaveLength(0)

    const rows = await db
      .select({ target: tutorTranslations.target })
      .from(tutorTranslations)
      .where(and(eq(tutorTranslations.lang, 'ar'), eq(tutorTranslations.source, `${TAG} video`)))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.target).toBe(`ترجمة: ${TAG} video`)

    // A restarted server reads the table instead of paying again.
    resetTranslationMemory()
    const restarted = await get<State>(learner, `/api/multi-learning/state?courseId=${ids.course}&lang=ar`)
    expect(restarted.body.data.active?.units[0]?.name).toBe(`ترجمة: ${TAG} unit`)
    expect(calls).toHaveLength(0)
  })

  it('falls back to English when potential-ai fails, and caches nothing', async () => {
    failNext = true
    const res = await get<{ title: string; description: string }>(learner, `/api/multi-learning/units/${ids.unit}/intro?lang=ur`)
    expect(res.status).toBe(200)
    expect(res.body.data.description).toBe(`${TAG} unit description`)
    expect(calls.length).toBeGreaterThan(0)
    const rows = await db
      .select({ id: tutorTranslations.id })
      .from(tutorTranslations)
      .where(and(eq(tutorTranslations.lang, 'ur'), eq(tutorTranslations.source, `${TAG} unit description`)))
    expect(rows).toHaveLength(0)
  })
})

describe('Tutor languages: a whitelist', () => {
  it('serves English, with no translation call, for any other language', async () => {
    for (const lang of ['en', 'de', 'fr', 'AR', 'HI', 'ar-AE', '', '../ar']) {
      const res = await get<State>(learner, `/api/multi-learning/state?courseId=${ids.course}&lang=${encodeURIComponent(lang)}`)
      expect(res.status).toBe(200)
      expect(res.body.data.language).toBe('en')
      expect(res.body.data.active?.units[0]?.name).toBe(`${TAG} unit`)
    }
    const repeated = await get<State>(learner, `/api/multi-learning/state?courseId=${ids.course}&lang=ar&lang=ur`)
    expect(repeated.body.data.language).toBe('en')
    expect(calls).toHaveLength(0)
  })
})
