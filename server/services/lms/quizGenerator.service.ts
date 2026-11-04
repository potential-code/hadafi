import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { db } from '../../db'
import { assessments, assessmentQuestions } from '../../db/schema'
import { AppError } from '../../utils/app-error'
import { SERVER_CLAIMS } from '../serviceTokenClaims'
import { getCourse } from './courses.service'

/**
 * "Write with AI" for pre-tests and final exams: drafts questions from the
 * whole course's own text through potential-ai's quiz writer
 * (POST /api/learning/quiz-generate), the way SMEEP does (642cc49). Nothing is
 * saved here: the admin picks which drafts to keep, and they're created
 * through the normal assessment question endpoint. Only pre-tests and final
 * exams get drafts: lesson question blocks are ungraded surveys.
 *
 * The call is made by Hadafi's server with a short-lived, server-scoped
 * service token; the browser never sees it.
 */

export type QuizFormat = 'multiple-choice' | 'true-false' | 'mixed'

export interface DraftQuestion {
  format: 'multiple-choice' | 'true-false'
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

/** Below this much text there is nothing to write good questions from. */
const MIN_TEXT = 300
const PER_BLOCK = 4000
const TOTAL = 60_000
/** One structured model call plus a check pass; potential-ai answers in about 10-30s. */
const TIMEOUT_MS = 120_000

// ── Course text ──────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&rdquo;': '"',
  '&ldquo;': '"',
}
const ZERO_WIDTH = /[​-‍﻿]/g
const clean = (t: string) => t.replace(ZERO_WIDTH, '').replace(/[ \t]+/g, ' ').trim()
const decodeEntities = (t: string) =>
  t.replace(/&[a-z]+;|&#\d+;/gi, (m) =>
    ENTITIES[m.toLowerCase()] ?? (m.startsWith('&#') ? String.fromCharCode(Number(m.slice(2, -1))) || m : m),
  )

/**
 * Lesson bodies are stored as HTML (the rich-text editor). Converts them to
 * Markdown-ish text: headings, list items, bold/italic and paragraph breaks
 * survive; every other tag is dropped. Plain text passes through. Same rules
 * as SMEEP's htmlToMarkdown.
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return ''
  let text = html.replace(ZERO_WIDTH, '')
  if (!/[<>]/.test(text)) return clean(text)
  text = text
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*h([1-6])[^>]*>/gi, (_m, level) => `\n\n${'#'.repeat(Math.min(Math.max(Number(level), 2), 4))} `)
    .replace(/<\s*\/\s*h[1-6]\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*li\s*>/gi, '')
    .replace(/<\s*(p|div|ul|ol|blockquote|table|tr)[^>]*>/gi, '\n\n')
    .replace(/<\s*\/\s*(p|div|ul|ol|blockquote|table|tr)\s*>/gi, '\n\n')
    .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_m, _t, inner) => (String(inner).trim() ? `**${String(inner).trim()}**` : ''))
    .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_m, _t, inner) => (String(inner).trim() ? `*${String(inner).trim()}*` : ''))
    .replace(/<[^>]+>/g, '')
  return decodeEntities(text)
    .split('\n')
    .map((line) => clean(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/-\n+#{2,4} /g, '- ')
    .trim()
}

type BlockText = { title: string; type: string; body: string | null; transcript: string | null }

function blockText(b: BlockText): string {
  if (b.type === 'text') return htmlToMarkdown(b.body).slice(0, PER_BLOCK)
  if (b.type === 'video') return (b.transcript ?? '').trim().slice(0, PER_BLOCK)
  return ''
}

function unitText(u: { title: string; description?: string | null }, blocks: BlockText[]): string {
  const parts = blocks.map((b) => {
    const t = blockText(b)
    return t ? `${b.title ? `### ${b.title}\n` : ''}${t}` : ''
  })
  const body = parts.filter(Boolean).join('\n\n')
  return body ? `## ${u.title}\n${u.description ? `${u.description}\n` : ''}\n${body}` : ''
}

/** Shares the budget across units, so a long first unit can't crowd out the rest. */
function fitText(sections: string[]): string {
  const filled = sections.filter(Boolean)
  if (!filled.length) return ''
  const each = Math.max(2000, Math.floor(TOTAL / filled.length))
  return filled.map((s) => s.slice(0, each)).join('\n\n---\n\n').slice(0, TOTAL)
}

interface Source {
  title: string
  content: string
  purpose: 'pre' | 'post'
  avoid: string[]
}

async function sourceFor(assessmentId: string): Promise<Source> {
  const [a] = await db.select().from(assessments).where(eq(assessments.id, assessmentId))
  if (!a) throw new AppError('Assessment not found', 404, 'NOT_FOUND')
  const course = await getCourse(a.courseId)
  if (!course) throw new AppError('Course not found', 404, 'NOT_FOUND')
  const existing = await db
    .select({ q: assessmentQuestions.questionText })
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, a.id))
  const sections = course.modules.flatMap((m) => m.units.map((u) => unitText(u, u.blocks)))
  return {
    title: course.title.slice(0, 300),
    content: fitText([course.description ? `# ${course.title}\n${htmlToMarkdown(course.description)}` : '', ...sections]),
    purpose: a.assessmentType,
    // potential-ai takes up to 200 questions to avoid, 2,000 characters each.
    avoid: existing.slice(0, 200).map((e) => e.q.slice(0, 2000)),
  }
}

// ── potential-ai ─────────────────────────────────────────────────────────────

/** The AI backend's base URL (the same variable the browser chat uses). */
export function getAiBaseUrl(): string {
  const base = process.env['NEXT_PUBLIC_AI_BACKEND_URL']
  if (!base) throw new AppError('The AI writer is not set up yet.', 503, 'AI_NOT_CONFIGURED')
  return base.replace(/\/$/, '')
}

/**
 * A 5-minute service token for one server-to-server call:
 * `{ platformId: 'hadafi', userId, scope: 'server' }`, HS256 with the shared
 * COPILOT_SERVICE_JWT_SECRET. potential-ai lets a `server` token reach its
 * /api/* endpoints only (see serviceTokenClaims.ts).
 */
export function mintServiceToken(userId: string): string {
  const secret = process.env['COPILOT_SERVICE_JWT_SECRET']
  if (!secret) throw new AppError('The AI writer is not set up yet.', 503, 'AI_NOT_CONFIGURED')
  return jwt.sign({ platformId: 'hadafi', userId, ...SERVER_CLAIMS }, secret, { algorithm: 'HS256', expiresIn: 300 })
}

/**
 * Keeps only well-formed drafts: a question, the right number of non-empty
 * options for its format and a correct index that points at one of them.
 * What potential-ai sends back is checked like any other input.
 */
export function sanitizeDrafts(raw: unknown, format: QuizFormat): DraftQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: DraftQuestion[] = []
  for (const q of raw as Record<string, unknown>[]) {
    if (!q || typeof q !== 'object') continue
    const kind = q['format'] === 'true-false' ? 'true-false' : q['format'] === 'multiple-choice' ? 'multiple-choice' : null
    if (!kind || (format !== 'mixed' && kind !== format)) continue
    const question = typeof q['question'] === 'string' ? q['question'].trim().slice(0, 1000) : ''
    const options = Array.isArray(q['options'])
      ? (q['options'] as unknown[]).map((o) => (typeof o === 'string' ? o.trim().slice(0, 500) : ''))
      : []
    const correctIndex = Number(q['correctIndex'])
    if (!question || options.some((o) => !o)) continue
    if (kind === 'true-false' ? options.length !== 2 : options.length < 2 || options.length > 6) continue
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) continue
    const explanation = typeof q['explanation'] === 'string' ? q['explanation'].trim().slice(0, 2000) : ''
    out.push({ format: kind, question, options, correctIndex, explanation })
  }
  return out
}

/** One call to potential-ai's quiz writer. */
export async function requestQuiz(
  userId: string,
  body: { title: string; content: string; purpose: 'pre' | 'post'; count: number; format: QuizFormat; avoid?: string[] },
): Promise<DraftQuestion[]> {
  const failed = () => new AppError('Questions couldn’t be written right now. Try again in a minute.', 502, 'AI_REQUEST_FAILED')
  const url = `${getAiBaseUrl()}/api/learning/quiz-generate`
  const token = mintServiceToken(userId)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw failed()
  }
  if (!res.ok) throw failed()
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: { questions?: unknown } } | null
  if (!json?.success || !Array.isArray(json.data?.questions)) throw failed()
  return sanitizeDrafts(json.data.questions, body.format).slice(0, body.count)
}

export async function generateQuizDrafts(
  userId: string,
  assessmentId: string,
  opts: { count: number; format: QuizFormat },
): Promise<DraftQuestion[]> {
  const source = await sourceFor(assessmentId)
  if (source.content.length < MIN_TEXT) {
    throw new AppError(
      'There isn’t enough lesson text to write questions from yet. Add text or video transcripts to the units first.',
      422,
      'NOT_ENOUGH_CONTENT',
    )
  }
  const questions = await requestQuiz(userId, { ...source, count: opts.count, format: opts.format })
  if (!questions.length) {
    throw new AppError('No questions could be checked against this content. Try again, or add more lesson text.', 422, 'NO_QUESTIONS')
  }
  return questions
}
