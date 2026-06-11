import PDFDocument from 'pdfkit'
import { db } from '../../db'
import {
  courses, modules, units, learningBlocks, blockQuestions, questionAnswers, users,
} from '../../db/schema'
import { eq, and, inArray } from 'drizzle-orm'

/**
 * Returns all action-plan block questions for a course along with the learner's saved answers.
 *
 * @param userId   - UUID of the learner.
 * @param courseId - UUID of the course.
 */
export async function getActionPlan(userId: string, courseId: string) {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId))
  if (!course) throw new Error('COURSE_NOT_FOUND')

  const courseModules = await db.select().from(modules).where(eq(modules.courseId, courseId))
  const moduleIds = courseModules.map(m => m.id)

  const courseUnits = moduleIds.length
    ? await db.select().from(units).where(inArray(units.moduleId, moduleIds))
    : []
  const unitIds = courseUnits.map(u => u.id)

  const questionBlocks = unitIds.length
    ? await db.select().from(learningBlocks)
        .where(and(inArray(learningBlocks.unitId, unitIds), eq(learningBlocks.type, 'question')))
    : []

  const blockIds = questionBlocks.map(b => b.id)

  const allBlockQuestions = blockIds.length
    ? await db.select().from(blockQuestions)
        .where(and(inArray(blockQuestions.blockId, blockIds), eq(blockQuestions.kind, 'action-plan')))
    : []

  const questionIds = allBlockQuestions.map(q => q.id)

  const answers = questionIds.length
    ? await db.select().from(questionAnswers)
        .where(and(eq(questionAnswers.userId, userId), inArray(questionAnswers.questionId, questionIds)))
    : []

  const answerMap = new Map(answers.map(a => [a.questionId, a]))

  return {
    courseTitle: course.title,
    questions: allBlockQuestions.map(q => ({
      question: q,
      answer: answerMap.get(q.id) ?? null,
    })),
  }
}

/**
 * Generates a PDF document summarising the learner's action-plan responses for a course.
 * Uses PDFKit to produce a branded, A4-sized document with per-question sections.
 * Returns an empty-state PDF if the course has no action-plan questions.
 *
 * @param userId   - UUID of the learner.
 * @param courseId - UUID of the course.
 * @returns A Buffer containing the complete PDF binary.
 */
export async function generateActionPlanPdf(userId: string, courseId: string): Promise<Buffer> {
  // Fetch user and action plan data in parallel
  const [[user], actionPlan] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    getActionPlan(userId, courseId),
  ])

  const userFullName = user?.fullName ?? 'Learner'
  const { courseTitle, questions: actionPlanItems } = actionPlan

  // Collect PDFKit output chunks into a Buffer
  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))

  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve)
    doc.on('error', reject)

    // ── Header banner ────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill('#9f2063')
    doc.fillColor('white').fontSize(24).font('Helvetica-Bold')
       .text('Action Plan', 50, 25)
    doc.fillColor('#e83e94').fontSize(14).font('Helvetica')
       .text(courseTitle, 50, 55)

    // ── Student info ─────────────────────────────────────────────────────────
    doc.moveDown(3)
    doc.fillColor('#1f2937').fontSize(14).font('Helvetica-Bold')
       .text(`Prepared by: ${userFullName}`)
    doc.fillColor('#6b7280').fontSize(11).font('Helvetica')
       .text(`Generated: ${new Date().toLocaleDateString()}`)
    doc.moveDown(2)

    if (actionPlanItems.length === 0) {
      // Empty-state message when there are no action-plan questions
      doc.fillColor('#6b7280').fontSize(13).font('Helvetica')
         .text('No action plan responses recorded.', { align: 'center' })
    } else {
      // ── Action plan items ──────────────────────────────────────────────────
      for (const item of actionPlanItems) {
        // Question prompt as a coloured section header
        doc.fillColor('#9f2063').fontSize(13).font('Helvetica-Bold')
           .text(item.question.prompt, { continued: false })
        doc.moveDown(0.5)

        // Learner's answer, or a placeholder if not yet answered
        const answer = item.answer?.answerData?.openEndedAnswer ?? '(no answer provided)'
        doc.fillColor('#374151').fontSize(11).font('Helvetica')
           .text(answer, { indent: 20 })
        doc.moveDown(1.5)

        // Thin separator between items
        doc.moveTo(50, doc.y)
           .lineTo(doc.page.width - 50, doc.y)
           .strokeColor('#e5e7eb')
           .stroke()
        doc.moveDown(1)
      }
    }

    doc.end()
  })

  return Buffer.concat(chunks)
}
