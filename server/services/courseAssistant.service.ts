import { getLearnerCourse } from './lms/learner.service'
import { AppError } from '../utils/app-error'

/**
 * What Hana reads on a course page (potential-ai's `smeepCourseHelp` agent,
 * ported from SMEEP fc50679 / 5326d08): the course, the learner's progress,
 * and the step they have open. Built here from the learner's own course
 * payload (getLearnerCourse), so it holds only this course, only what this
 * learner may see (an outline before enrolling), and never an answer key.
 * The page adds the live exam question on screen (it lives in the browser)
 * and sends the whole thing as the `__course_page__` context entry. The
 * agent's rules ("never give the answer") live on potential-ai.
 */

const MAX_TEXT = 6000

/** Plain text from lesson HTML/markdown, trimmed to what a prompt can carry. */
export function plainText(source: string | null | undefined, max = MAX_TEXT): string {
  if (!source) return ''
  const text = source
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

type LearnerCourse = Awaited<ReturnType<typeof getLearnerCourse>>
type Unit = LearnerCourse['modules'][number]['units'][number]
type Block = Unit['blocks'][number]

function blockKind(block: Block): string {
  if (block.type === 'question') return block.questions.every((q) => q.kind === 'action-plan') ? 'Action plan' : 'Reflection'
  if (block.type === 'video') return 'Video'
  if (block.type === 'image') return 'Image'
  return 'Reading'
}

function unitStatus(unit: Unit): string {
  if (unit.isLocked) return 'locked'
  const s = unit.unitProgress?.status
  return s === 'completed' ? 'done' : s === 'in_progress' ? 'in progress' : 'not started'
}

function blockOnScreen(block: Block) {
  const base = { type: blockKind(block), title: block.title?.trim() || blockKind(block) }
  switch (block.type) {
    case 'text':
      return { ...base, readingText: plainText(block.body) }
    case 'video':
      return {
        ...base,
        watchedPercent: Math.round(block.blockProgress?.videoWatchPct ?? 0),
        transcript: plainText(block.transcript) || 'No transcript for this video.',
      }
    case 'question': {
      const actionPlan = block.questions.every((q) => q.kind === 'action-plan')
      return {
        ...base,
        note: actionPlan
          ? "The learner writes their own action plan. Help them think; don't write it for them."
          : 'Reflection questions: there are no wrong answers. Help them think; do not choose for them.',
        // Prompts and options only: the keys were removed by getLearnerCourse.
        questions: block.questions.map((q) => ({
          prompt: q.prompt,
          format: q.format,
          ...(q.options?.length ? { options: q.options } : {}),
        })),
      }
    }
    default:
      return base
  }
}

/**
 * `step` is the open step: a learning block id from this course, or "pre" /
 * "post" for its pre-test or final exam. Anything else is "nothing open".
 */
export async function getCourseAssistantContext(userId: string, courseId: string, step?: string | null) {
  let course: LearnerCourse
  try {
    course = await getLearnerCourse(userId, courseId)
  } catch (e) {
    if (e instanceof Error && e.message === 'COURSE_NOT_FOUND') throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND')
    throw e
  }

  const courseInfo = {
    title: course.title,
    ...(course.description ? { description: plainText(course.description, 600) } : {}),
    ...(course.difficulty ? { level: course.difficulty } : {}),
    ...(course.category ? { category: course.category } : {}),
    certificate: course.enableCertificate ? 'awarded when the course is complete' : 'none',
  }

  if (!course.isEnrolled) {
    const p = 'preview' in course ? course.preview : null
    return {
      page: 'Course overview, before starting. The learner has not started this course yet.',
      course: courseInfo,
      ...(p
        ? {
            units: p.units.map((u: { title: string; description?: string | null }, i: number) => ({
              unit: i + 1,
              title: u.title,
              ...(u.description ? { about: plainText(u.description, 300) } : {}),
            })),
            contains: p.totals,
            preTest: p.hasPreTest,
            finalExam: p.hasFinalExam,
          }
        : {}),
      howToStart: 'The "Start course" button on this page.',
    }
  }

  const unitsList = course.modules.flatMap((m) => m.units)
  const done = unitsList.filter((u) => u.unitProgress?.status === 'completed').length

  let onScreen: unknown = 'Nothing open'
  let nextStep: string | null = null
  if (step === 'pre' || step === 'post') {
    const a = step === 'pre' ? course.preAssessment : course.postAssessment
    if (a) {
      onScreen = {
        type: step === 'pre' ? 'Pre-test' : 'Final exam',
        title: a.title,
        status: a.isLocked ? 'locked' : (step === 'pre' ? a.isCompleted : course.progressPercentage >= 100) ? 'completed' : 'not completed',
        questions: a.questions.length,
        note:
          step === 'pre'
            ? 'A short check of what the learner already knows, before the course. Never help answer its questions.'
            : 'The graded final exam. Never help answer its questions or explain the ideas they test while the learner is answering.',
      }
    }
  } else if (step) {
    let n = 0
    for (const unit of unitsList) {
      n++
      const at = unit.blocks.findIndex((b) => b.id === step)
      if (at < 0) continue
      const block = unit.blocks[at]!
      onScreen = {
        where: `Unit ${n}: ${unit.title}, step ${at + 1} of ${unit.blocks.length}`,
        status: block.blockProgress?.status === 'completed' ? 'completed' : 'not completed yet',
        ...blockOnScreen(block),
      }
      const following = unit.blocks[at + 1]
      const nextUnit = unitsList[n]
      nextStep = following
        ? `${blockKind(following)} in unit ${n}`
        : nextUnit
          ? `Unit ${n + 1}: ${nextUnit.title}`
          : course.postAssessment
            ? 'The final exam'
            : null
      break
    }
  }

  return {
    page: 'Course player',
    course: courseInfo,
    progress: {
      percent: Math.round(course.progressPercentage),
      unitsDone: `${done} of ${unitsList.length}`,
      ...(course.preAssessment ? { preTest: course.preAssessment.isCompleted ? 'done' : 'not taken yet' } : {}),
      ...(course.postAssessment
        ? {
            finalExam:
              course.progressPercentage >= 100 ? 'passed' : course.postAssessment.isLocked ? 'locked until the units are done' : 'open',
          }
        : {}),
    },
    units: unitsList.slice(0, 60).map((u, i) => ({ unit: i + 1, title: u.title, status: unitStatus(u) })),
    onScreen,
    ...(nextStep ? { nextStep } : {}),
  }
}
