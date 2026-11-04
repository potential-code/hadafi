import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  courses, modules, units, learningBlocks, blockQuestions, assessments, assessmentQuestions,
  courseEnrollments, users, userLearningBlockProgress, pointsEvents,
} from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'
import { browserClaims, fingerprint } from '../services/serviceTokenClaims'
import { ASK_HANA_PROMPT, SIGN_UP_PROMPT } from '../../shared/hana/prompts'

/**
 * Multi Learning (Hana as the tutor) and the course-page assistant.
 *
 * The tutor only records what the course page itself would allow: enrolled
 * learners, published courses, the pre-test first, each step after the ones
 * before it, question blocks only once answered, the final exam only after
 * every unit, exams marked on the server, and points once per unit. The
 * course assistant reads only the open course, without answer keys.
 *
 * Builds its own small course and removes it afterwards.
 */

const PTS = 7
let learner: TestUser
let outsider: TestUser
const ids = {
  course: '', other: '', draft: '',
  unit1: '', unit2: '',
  intro: '', video: '', read: '', readMore: '', plan: '', checkIn: '',
  u2text: '', u2plan: '',
  planQ1: '', planQ2: '', checkQ: '', u2planQ: '',
  pre: '', preQ: '', post: '', postQ: '',
  otherBlock: '',
}

type Res<T = unknown> = { success: boolean; data: T; error?: { code: string } }
type State = {
  active: null | { units: Array<{ unitId: string; complete: boolean; steps: Array<{ kind: string; done: boolean }> }>; complete: boolean }
  next: { action: string; assessmentId?: string; learningBlockId?: string; unitId?: string; checkIn?: boolean; pretest?: boolean }
  text: string
}

async function points(userId: string): Promise<number> {
  const [u] = await db.select({ points: users.points }).from(users).where(eq(users.id, userId))
  return u!.points
}
async function done(userId: string, blockId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: userLearningBlockProgress.status })
    .from(userLearningBlockProgress)
    .where(and(eq(userLearningBlockProgress.userId, userId), eq(userLearningBlockProgress.learningBlockId, blockId)))
  return row?.status === 'completed'
}
const state = (u: TestUser, courseId = ids.course) =>
  api<Res<State>>('GET', `/api/multi-learning/state?courseId=${courseId}`, { token: u.token })
const complete = (u: TestUser, blockIds: string[]) =>
  api<Res>('POST', '/api/multi-learning/progress/complete', { token: u.token, body: { learningBlockIds: blockIds } })

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('tutor')
  outsider = await createTestUser('tutor-outsider')

  const [course] = await db
    .insert(courses)
    .values({ title: 'E2E tutor course', description: 'Tutor course description', status: 'published', pointsPerUnit: PTS })
    .returning()
  const [other] = await db.insert(courses).values({ title: 'E2E other course', status: 'published' }).returning()
  const [draft] = await db.insert(courses).values({ title: 'E2E draft tutor course', status: 'draft' }).returning()
  ids.course = course!.id
  ids.other = other!.id
  ids.draft = draft!.id

  const [mod] = await db.insert(modules).values({ courseId: ids.course, title: 'Module' }).returning()
  const [u1] = await db.insert(units).values({ moduleId: mod!.id, title: 'Tutor unit one', order: 0 }).returning()
  const [u2] = await db.insert(units).values({ moduleId: mod!.id, title: 'Tutor unit two', order: 1 }).returning()
  ids.unit1 = u1!.id
  ids.unit2 = u2!.id

  const b = await db
    .insert(learningBlocks)
    .values([
      { unitId: ids.unit1, type: 'text', title: 'Welcome', body: '<p>Opening text</p>', order: 0 },
      { unitId: ids.unit1, type: 'video', title: 'Video', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', order: 1 },
      { unitId: ids.unit1, type: 'text', title: 'Read', body: '<ul><li>Outline point</li></ul>', order: 2 },
      { unitId: ids.unit1, type: 'text', title: 'Read More', body: '<p>The narration of the video.</p>', order: 3 },
      { unitId: ids.unit1, type: 'question', title: 'Action Plan', order: 4 },
      { unitId: ids.unit1, type: 'question', title: 'Tutor complete unit 1', order: 5 },
      { unitId: ids.unit2, type: 'text', title: 'Read', body: '<p>Unit two text</p>', order: 0 },
      { unitId: ids.unit2, type: 'question', title: 'Action Plan', order: 1 },
    ])
    .returning()
  ;[ids.intro, ids.video, ids.read, ids.readMore, ids.plan, ids.checkIn, ids.u2text, ids.u2plan] = b.map((x) => x.id) as string[] as [
    string, string, string, string, string, string, string, string,
  ]

  const q = await db
    .insert(blockQuestions)
    .values([
      { blockId: ids.plan, kind: 'action-plan', format: 'short-text', prompt: 'What will you do first?', order: 0 },
      { blockId: ids.plan, kind: 'action-plan', format: 'short-text', prompt: 'By when?', order: 1 },
      { blockId: ids.checkIn, kind: 'survey', format: 'multiple-choice', prompt: 'Did you finish unit 1?', options: ['Yes', 'No'], correctIndex: 0, order: 0 },
      { blockId: ids.u2plan, kind: 'action-plan', format: 'short-text', prompt: 'Unit two plan', order: 0 },
    ])
    .returning()
  ;[ids.planQ1, ids.planQ2, ids.checkQ, ids.u2planQ] = q.map((x) => x.id) as [string, string, string, string]

  const [pre] = await db
    .insert(assessments)
    .values({ courseId: ids.course, title: 'Tutor pre-test', assessmentType: 'pre', isGraded: true, passingScore: 50 })
    .returning()
  const [post] = await db
    .insert(assessments)
    .values({ courseId: ids.course, title: 'Tutor final exam', assessmentType: 'post', isGraded: true, passingScore: 100, maxAttempts: 3 })
    .returning()
  ids.pre = pre!.id
  ids.post = post!.id
  const [preQ] = await db
    .insert(assessmentQuestions)
    .values({ assessmentId: ids.pre, questionText: 'Pre question', options: ['A', 'B'], correctAnswer: 1 })
    .returning()
  const [postQ] = await db
    .insert(assessmentQuestions)
    .values({ assessmentId: ids.post, questionText: 'Final question', options: ['A', 'B', 'C'], correctAnswer: 2 })
    .returning()
  ids.preQ = preQ!.id
  ids.postQ = postQ!.id

  const [oMod] = await db.insert(modules).values({ courseId: ids.other, title: 'Other module' }).returning()
  const [oUnit] = await db.insert(units).values({ moduleId: oMod!.id, title: 'Other unit' }).returning()
  const [oBlock] = await db.insert(learningBlocks).values({ unitId: oUnit!.id, type: 'text', title: 'Other', body: 'Other course text' }).returning()
  ids.otherBlock = oBlock!.id

  await db.insert(courseEnrollments).values([
    { userId: learner.id, courseId: ids.course },
    { userId: learner.id, courseId: ids.other },
  ])
})

afterAll(async () => {
  await db.delete(courses).where(inArray(courses.id, [ids.course, ids.other, ids.draft]))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('Multi Learning: only enrolled learners', () => {
  it('needs a session', async () => {
    const res = await api('GET', `/api/multi-learning/state?courseId=${ids.course}`)
    expect(res.status).toBe(401)
  })

  it("refuses a course the learner isn't enrolled in, for every card and every write", async () => {
    expect((await state(outsider)).status).toBe(404)
    expect((await api('GET', `/api/multi-learning/units/${ids.unit1}/intro`, { token: outsider.token })).status).toBe(404)
    expect((await api('GET', `/api/multi-learning/units/${ids.unit1}/material`, { token: outsider.token })).status).toBe(404)
    expect((await api('GET', `/api/multi-learning/videos/${ids.video}`, { token: outsider.token })).status).toBe(404)
    expect((await api('GET', `/api/multi-learning/steps/${ids.plan}`, { token: outsider.token })).status).toBe(404)
    expect((await api('GET', `/api/multi-learning/quizzes/${ids.pre}`, { token: outsider.token })).status).toBe(404)
    expect((await complete(outsider, [ids.intro])).status).toBe(404)
    const quiz = await api('POST', `/api/multi-learning/quizzes/${ids.pre}/submit`, {
      token: outsider.token,
      body: { answers: [{ questionId: ids.preQ, selectedIndex: 1 }] },
    })
    expect(quiz.status).toBe(404)
    const step = await api('POST', `/api/multi-learning/steps/${ids.plan}/submit`, {
      token: outsider.token,
      body: { answers: [{ questionId: ids.planQ1, text: 'x' }, { questionId: ids.planQ2, text: 'y' }] },
    })
    expect(step.status).toBe(404)
    expect(await done(outsider.id, ids.intro)).toBe(false)
  })

  it('lists only published courses the learner is in', async () => {
    const res = await api<Res<{ courses: Array<{ courseId: string }> }>>('GET', '/api/multi-learning/state', { token: learner.token })
    expect(res.status).toBe(200)
    const listed = res.body.data.courses.map((c) => c.courseId)
    expect(listed).toContain(ids.course)
    expect(listed).not.toContain(ids.draft)
  })
})

describe('Multi Learning: the tutor completes only what the course page would allow', () => {
  it('opens with the pre-test and refuses lessons before it', async () => {
    const s = await state(learner)
    expect(s.status).toBe(200)
    expect(s.body.data.next).toMatchObject({ action: 'show_quiz', assessmentId: ids.pre, pretest: true })
    expect(s.body.data.text).toContain('NEXT STEP:')
    const res = await complete(learner, [ids.intro])
    expect(res.status).toBe(409)
    expect(res.body.error?.code).toBe('STEP_LOCKED')
    expect(await done(learner.id, ids.intro)).toBe(false)
  })

  it('serves exam questions without answer keys and marks them on the server', async () => {
    const card = await api<Res>('GET', `/api/multi-learning/quizzes/${ids.pre}`, { token: learner.token })
    expect(card.status).toBe(200)
    expect(JSON.stringify(card.body)).not.toMatch(/correct/i)
    // A wrong answer stays below the pass mark, whatever the browser claims.
    const fail = await api<Res<{ passed: boolean; score: number }>>('POST', `/api/multi-learning/quizzes/${ids.pre}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.preQ, selectedIndex: 0 }], score: 100, passed: true },
    })
    expect(fail.status).toBe(422) // extra fields are refused outright
    const wrong = await api<Res<{ passed: boolean; score: number }>>('POST', `/api/multi-learning/quizzes/${ids.pre}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.preQ, selectedIndex: 0 }] },
    })
    expect(wrong.status).toBe(200)
    expect(wrong.body.data).toMatchObject({ passed: false, score: 0 })
    expect((await complete(learner, [ids.intro])).status).toBe(409)
    const right = await api<Res<{ passed: boolean }>>('POST', `/api/multi-learning/quizzes/${ids.pre}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.preQ, selectedIndex: 1 }] },
    })
    expect(right.body.data.passed).toBe(true)
    expect((await state(learner)).body.data.next).toMatchObject({ action: 'show_unit_intro', unitId: ids.unit1 })
  })

  it('refuses a step before the ones ahead of it, in this unit or the next', async () => {
    for (const blockId of [ids.video, ids.read, ids.u2text]) {
      const res = await complete(learner, [blockId])
      expect(res.status).toBe(409)
      expect(res.body.error?.code).toBe('STEP_LOCKED')
      expect(await done(learner.id, blockId)).toBe(false)
    }
    expect((await complete(learner, [ids.intro])).status).toBe(200)
    expect((await complete(learner, [ids.video])).status).toBe(200)
    // The reading step's blocks go together.
    expect((await complete(learner, [ids.readMore, ids.read])).status).toBe(200)
    expect(await done(learner.id, ids.readMore)).toBe(true)
  })

  it('never completes a question block without its answers', async () => {
    const res = await complete(learner, [ids.plan])
    expect(res.status).toBe(409)
    expect(res.body.error?.code).toBe('BLOCK_NOT_ANSWERED')
    const half = await api<Res>('POST', `/api/multi-learning/steps/${ids.plan}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.planQ1, text: 'Call ten customers' }] },
    })
    expect(half.status).toBe(400)
    expect(await done(learner.id, ids.plan)).toBe(false)
    // The check-in comes after the plan.
    const early = await api<Res>('POST', `/api/multi-learning/steps/${ids.checkIn}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.checkQ, selected: 0 }] },
    })
    expect(early.status).toBe(409)
    // An option that doesn't exist is not an answer.
    const plan = await api<Res>('POST', `/api/multi-learning/steps/${ids.plan}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.planQ1, text: 'Call ten customers' }, { questionId: ids.planQ2, text: 'Friday' }] },
    })
    expect(plan.status).toBe(200)
    const bad = await api<Res>('POST', `/api/multi-learning/steps/${ids.checkIn}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.checkQ, selected: 5 }] },
    })
    expect(bad.status).toBe(400)
  })

  it('shows the check-in without its key, and completing the unit pays its points once', async () => {
    const card = await api<Res<{ kind: string; questions: Array<{ options: string[] }> }>>('GET', `/api/multi-learning/steps/${ids.checkIn}`, {
      token: learner.token,
    })
    expect(card.body.data.kind).toBe('check-in')
    expect(card.body.data.questions[0]!.options).toEqual(['Yes', 'No'])
    expect(JSON.stringify(card.body)).not.toMatch(/correct/i)
    expect((await state(learner)).body.data.next).toMatchObject({ action: 'show_action_plan', learningBlockId: ids.checkIn, checkIn: true })

    const before = await points(learner.id)
    const res = await api<Res>('POST', `/api/multi-learning/steps/${ids.checkIn}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.checkQ, selected: 1 }] },
    })
    expect(res.status).toBe(200)
    expect(await points(learner.id)).toBe(before + PTS)
    // Again, and again through the plan: nothing more.
    await api('POST', `/api/multi-learning/steps/${ids.checkIn}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.checkQ, selected: 0 }] },
    })
    await complete(learner, [ids.intro, ids.video])
    expect(await points(learner.id)).toBe(before + PTS)
    const ledger = await db
      .select({ id: pointsEvents.id })
      .from(pointsEvents)
      .where(and(eq(pointsEvents.userId, learner.id), eq(pointsEvents.ref, ids.unit1)))
    expect(ledger.length).toBe(1)
    const s = await state(learner)
    expect(s.body.data.active!.units[0]!.complete).toBe(true)
    expect(s.body.data.next).toMatchObject({ action: 'show_unit_intro', unitId: ids.unit2 })
  })

  it('opens the final exam only once every unit is done', async () => {
    const early = await api<Res>('GET', `/api/multi-learning/quizzes/${ids.post}`, { token: learner.token })
    expect(early.status).toBe(409)
    expect(early.body.error?.code).toBe('QUIZ_LOCKED')
    const submit = await api<Res>('POST', `/api/multi-learning/quizzes/${ids.post}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.postQ, selectedIndex: 2 }] },
    })
    expect(submit.status).toBe(409)

    expect((await complete(learner, [ids.u2text])).status).toBe(200)
    expect(
      (
        await api('POST', `/api/multi-learning/steps/${ids.u2plan}/submit`, {
          token: learner.token,
          body: { answers: [{ questionId: ids.u2planQ, text: 'Plan for unit two' }] },
        })
      ).status,
    ).toBe(200)
    expect((await state(learner)).body.data.next).toMatchObject({ action: 'show_quiz', assessmentId: ids.post, pretest: false })
    const card = await api<Res>('GET', `/api/multi-learning/quizzes/${ids.post}`, { token: learner.token })
    expect(card.status).toBe(200)
    expect(JSON.stringify(card.body)).not.toMatch(/correct/i)
    const pass = await api<Res<{ passed: boolean }>>('POST', `/api/multi-learning/quizzes/${ids.post}/submit`, {
      token: learner.token,
      body: { answers: [{ questionId: ids.postQ, selectedIndex: 2 }] },
    })
    expect(pass.body.data.passed).toBe(true)
    const s = await state(learner)
    expect(s.body.data.active!.complete).toBe(true)
    expect(s.body.data.next).toMatchObject({ action: 'show_courses', reason: 'course_complete' })
  })

  it('stops recording once a course is unpublished', async () => {
    await db.update(courses).set({ status: 'draft' }).where(eq(courses.id, ids.other))
    try {
      expect((await state(learner, ids.other)).status).toBe(404)
      expect((await complete(learner, [ids.otherBlock])).status).toBe(404)
      expect(await done(learner.id, ids.otherBlock)).toBe(false)
    } finally {
      await db.update(courses).set({ status: 'published' }).where(eq(courses.id, ids.other))
    }
  })

  it('completes one course at a time', async () => {
    const res = await complete(learner, [ids.otherBlock, ids.intro])
    expect(res.status).toBe(400)
  })
})

describe('Course assistant: only that course, never an answer key', () => {
  type Ctx = { page: string; units?: Array<{ title: string }>; onScreen?: unknown; course: { title: string } }
  const ctx = (u: TestUser, courseId: string, step?: string) =>
    api<Res<Ctx>>('GET', `/api/course-assistant/courses/${courseId}/context${step ? `?step=${step}` : ''}`, { token: u.token })

  it("holds this course's units and the step on screen, and nothing from other courses", async () => {
    const res = await ctx(learner, ids.course, ids.checkIn)
    expect(res.status).toBe(200)
    const text = JSON.stringify(res.body.data)
    expect(res.body.data.course.title).toBe('E2E tutor course')
    expect(res.body.data.units!.map((u) => u.title)).toEqual(['Tutor unit one', 'Tutor unit two'])
    expect(text).toContain('Did you finish unit 1?')
    expect(text).not.toContain('Other course text')
    expect(text).not.toMatch(/correctIndex|correctBool|correctAnswer|explanation/)
    // A block from another course is not "on screen" here.
    const foreign = await ctx(learner, ids.course, ids.otherBlock)
    expect(foreign.body.data.onScreen).toBe('Nothing open')
    expect(JSON.stringify(foreign.body.data)).not.toContain('Other course text')
  })

  it('shows an outline only, before the learner starts, and nothing for drafts', async () => {
    const res = await ctx(outsider, ids.course, ids.read)
    expect(res.status).toBe(200)
    expect(res.body.data.page).toContain('before starting')
    const text = JSON.stringify(res.body.data)
    expect(text).not.toContain('Outline point')
    expect(text).not.toContain('Did you finish unit 1?')
    expect((await ctx(outsider, ids.draft)).status).toBe(404)
    expect((await ctx(outsider, 'not-a-uuid')).status).toBe(404)
  })
})

describe('Hana tokens for the course player', () => {
  const clientDir = path.resolve(import.meta.dir, '../../client/components')
  const files = (dir: string) => readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(dir, f))

  it('signed-in learners get user-scope tokens listing every prompt a page sends', () => {
    const claims = browserClaims('sme')
    expect(claims.scope).toBe('user')
    expect(claims.prompts).toEqual([fingerprint(ASK_HANA_PROMPT), fingerprint(SIGN_UP_PROMPT)])
  })

  it('the tutor and the course assistant send no prompt of their own (potential-ai owns them)', () => {
    for (const file of [...files(path.join(clientDir, 'tutor')), ...files(path.join(clientDir, 'course-hana'))]) {
      expect(readFileSync(file, 'utf8')).not.toContain('__system_prompt__')
    }
  })
})
