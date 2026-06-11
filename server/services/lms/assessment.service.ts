import { db } from '../../db'
import {
  assessments, assessmentQuestions, assessmentAttempts,
} from '../../db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { recalculateCourseProgress } from './progress.service'

/**
 * Returns a summary of the assessment state for a learner, including attempt history,
 * best score, whether they can start another attempt, and optionally correct answers.
 *
 * @param userId        - UUID of the learner.
 * @param assessmentId  - UUID of the assessment.
 */
export async function getAssessmentSummary(userId: string, assessmentId: string) {
  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId))
  if (!assessment) throw new Error('NOT_FOUND')

  const questions = await db.select().from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(asc(assessmentQuestions.order))

  const attempts = await db.select().from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, assessmentId)))

  const attemptsMade = attempts.length
  const attemptsRemaining = assessment.maxAttempts === 0 ? -1 : Math.max(0, assessment.maxAttempts - attemptsMade)
  const hasPassed = attempts.some(a => a.passed === true)

  const scoredAttempts = attempts.filter(a => a.score !== null)
  const bestScore = scoredAttempts.length > 0
    ? Math.max(...scoredAttempts.map(a => a.score as number))
    : null

  const latestAttempt = attempts.length > 0
    ? attempts.reduce((latest, a) => a.attemptNumber > latest.attemptNumber ? a : latest)
    : null

  const canStartAssessment = !hasPassed && (assessment.maxAttempts === 0 || attemptsMade < assessment.maxAttempts)

  const canShowAnswers = assessment.showAnswers
    && (hasPassed || attemptsRemaining === 0 || (!assessment.isGraded && attemptsMade > 0))

  const correctAnswers = canShowAnswers
    ? questions.map(q => ({ questionText: q.questionText, correctAnswer: q.correctAnswer }))
    : null

  return {
    assessment: {
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      assessmentType: assessment.assessmentType,
      isGraded: assessment.isGraded,
      passingScore: assessment.passingScore,
      showAnswers: assessment.showAnswers,
      maxAttempts: assessment.maxAttempts,
      totalQuestions: questions.length,
    },
    attemptsMade,
    attemptsRemaining,
    hasPassed,
    bestScore,
    latestAttempt: latestAttempt
      ? {
        id: latestAttempt.id,
        attemptNumber: latestAttempt.attemptNumber,
        score: latestAttempt.score,
        passed: latestAttempt.passed,
        completedAt: latestAttempt.completedAt,
      }
      : null,
    canStartAssessment,
    correctAnswers,
  }
}

/**
 * Returns all questions for an assessment ordered by position.
 * Strips correctAnswer to prevent answer leakage during an active attempt.
 *
 * @param assessmentId - UUID of the assessment.
 */
export async function getAssessmentQuestions(assessmentId: string) {
  const questions = await db.select().from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(asc(assessmentQuestions.order))

  // correctAnswer must not be sent to the client during the test
  return questions.map(({ correctAnswer: _omit, ...q }) => q)
}

/**
 * Records a completed assessment attempt, calculates the score, and triggers
 * course progress recalculation if the attempt counts as a pass or completion.
 *
 * @param userId        - UUID of the learner.
 * @param assessmentId  - UUID of the assessment.
 * @param answers       - Map of questionId → selectedAnswerIndex.
 */
export async function submitAttempt(
  userId: string,
  assessmentId: string,
  answers: Record<string, number>,
) {
  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId))
  if (!assessment) throw new Error('NOT_FOUND')

  const existingAttempts = await db.select().from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, assessmentId)))

  if (assessment.maxAttempts > 0 && existingAttempts.length >= assessment.maxAttempts) {
    throw new Error('MAX_ATTEMPTS_EXCEEDED')
  }

  const questions = await db.select().from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(asc(assessmentQuestions.order))

  const correctCount = questions.filter(q => answers[q.id] === q.correctAnswer).length
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0
  const passed = assessment.isGraded ? score >= assessment.passingScore : null

  const [attempt] = await db.insert(assessmentAttempts)
    .values({
      userId,
      assessmentId,
      attemptNumber: existingAttempts.length + 1,
      answers,
      score,
      passed,
      completedAt: new Date(),
    })
    .returning()

  // Always recalculate so progress stays accurate regardless of pass/fail or
  // any previous assessment config changes (e.g. switching graded ↔ ungraded).
  await recalculateCourseProgress(userId, assessment.courseId)

  return getAssessmentSummary(userId, assessmentId)
}
