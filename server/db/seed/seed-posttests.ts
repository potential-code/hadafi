/**
 * One-time script: seed posttest assessments from WordPress export data.
 *
 * For each of the 40 courses that have an empty "posttest" unit in the
 * module/unit hierarchy, this script:
 *   1. Creates a proper `post` assessment in the assessments table.
 *   2. Populates assessment_questions from the WordPress JSON files.
 *   3. Deletes the now-redundant empty posttest unit.
 *
 * Safe to re-run: skips courses that already have a post assessment.
 *
 * Run from repo root:
 *   DATABASE_URL=postgresql://postgres:root@localhost:5432/smeep bun run server/db/seed/seed-posttests.ts
 * Or from server/:
 *   bun --env-file=../.env db/seed/seed-posttests.ts
 */

import { readFileSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { eq, and, sql, count } from 'drizzle-orm'
import { db } from '../index'
import {
  courses,
  modules,
  units,
  learningBlocks,
  assessments,
  assessmentQuestions,
} from '../schema/index'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const COURSES_DIR = resolve(dirname(new URL(import.meta.url).pathname), 'seed-data/courses')
const PASS_SCORE = 80
const SHOW_ANSWERS = true
const MAX_ATTEMPTS = 0 // unlimited

// Verified mapping: DB course title → WordPress export folder name
const COURSE_FOLDER_MAP: Record<string, string> = {
  '24 Minute Accounting': 'course-15-24-minute-accounting',
  '24 Minute CIO': 'course-21-24-minute-cio',
  '24 Minute MBA': 'course-91-24-minute-mba',
  '24 Minute Sales': 'course-43-24-minute-sales',
  'Business Etiquette': 'course-17-business-etiquette',
  'Call Center Essentials': 'course-20-call-center-essentials',
  'Communication Skills': 'course-88-communication-skills',
  'Corporate Social Responsibility (CSR)': 'course-24-corporate-social-responsibility-csr',
  'Creative Thinking': 'course-22-creative-thinking',
  'Critical Thinking': 'course-23-critical-thinking',
  'Customer Service': 'course-26-customer-service',
  'CV Writing': 'course-27-cv-writing',
  'Effective Customer Meetings': 'course-28-effective-customer-meetings',
  'Expand your Business': 'course-29-expand-your-business',
  'Financial Literacy': 'course-31-financial-literacy',
  'Fitness For Business': 'course-93-fitness-for-business',
  'Freelancing in Gig Economy': 'course-34-freelancing-in-gig-economy',
  'Innovation Design Thinking Course': 'course-32-innovation-design-thinking-course',
  'Internet Research': 'course-97-internet-research',
  'Interview Skills': 'course-33-interview-skills',
  'Leadership Essentials': 'course-35-leadership-essentials',
  'Managing your Cash Flow': 'course-36-managing-your-cash-flow',
  'Negotiation Skills': 'course-37-negotiation-skills',
  'Nutrition Tips': 'course-94-nutrition-tips',
  'Online Productivity Tools': 'course-98-online-productivity-tools',
  'Online Safety': 'course-38-online-safety',
  'Optimizing Nutrition': 'course-96-optimizing-nutrition',
  'Planning and Time Management': 'course-39-planning-and-time-management',
  'Podcast': 'course-41-podcast',
  'Presentation Skills': 'course-50-presentation-skills',
  'Problem Solving': 'course-95-problem-solving',
  'Productivity Skills': 'course-42-productivity-skills',
  'Project Management Essentials': 'course-40-project-management-essentials',
  'Social Media for Business': 'course-44-social-media-for-business',
  'Starting a Blog Online': 'course-45-starting-a-blog-online',
  'Startup your Business': 'course-46-startup',
  'Supervision Skills': 'course-47-supervision-skills',
  'SWOT Analysis': 'course-48-swot-analysis',
  'Teamwork': 'course-49-teamwork',
  'Uncovering Customer Needs': 'course-25-uncovering-customer-needs',
}

// ---------------------------------------------------------------------------
// WordPress JSON types (minimal)
// ---------------------------------------------------------------------------

interface WpAnswer {
  index: number
  text: string
  is_correct: boolean
}

interface WpQuestion {
  type: 'multi' | 'truefalse'
  text: string
  answers?: WpAnswer[]
  correct_answer?: string // "true" or "false" for truefalse
}

interface WpQuiz {
  title: string
  pass_mark: number
  questions: WpQuestion[]
}

interface WpUnit {
  title: string
  quiz?: WpQuiz
}

interface WpModule {
  units: WpUnit[]
}

interface WpCourse {
  course: {
    modules: WpModule[]
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPosttestUnit(title: string): boolean {
  const lower = title.toLowerCase()
  return lower.includes('posttest') || lower.includes('post test') || lower.includes('post-test')
}

function loadWordPressPosttest(folder: string): WpQuiz | null {
  const filePath = join(COURSES_DIR, folder, 'course.json')
  let raw: WpCourse
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8')) as WpCourse
  } catch (e) {
    console.error(`  ✗ Could not read ${filePath}:`, e)
    return null
  }

  for (const mod of raw.course.modules) {
    for (const unit of mod.units) {
      if (isPosttestUnit(unit.title) && unit.quiz && unit.quiz.questions?.length > 0) {
        return unit.quiz
      }
    }
  }
  return null
}

function mapQuestion(
  wpQ: WpQuestion,
  order: number,
): { questionType: 'multiple-choice' | 'true-false'; questionText: string; options: string[]; correctAnswer: number; order: number } | null {
  const questionText = wpQ.text?.trim()
  if (!questionText) return null

  if (wpQ.type === 'truefalse') {
    const correctAnswer = wpQ.correct_answer?.toLowerCase() === 'true' ? 0 : 1
    return {
      questionType: 'true-false',
      questionText,
      options: ['True', 'False'],
      correctAnswer,
      order,
    }
  }

  if (wpQ.type === 'multi') {
    if (!wpQ.answers || wpQ.answers.length === 0) return null
    // Sort by WordPress index (1-based), build 0-based options array
    const sorted = [...wpQ.answers].sort((a, b) => a.index - b.index)
    const options = sorted.map(a => a.text?.trim() ?? '')
    const correctIdx = sorted.findIndex(a => a.is_correct === true)
    if (correctIdx === -1) {
      console.warn(`    ⚠ No is_correct answer found in question: "${questionText.slice(0, 60)}..."`)
      return null
    }
    return {
      questionType: 'multiple-choice',
      questionText,
      options,
      correctAnswer: correctIdx,
      order,
    }
  }

  console.warn(`    ⚠ Unknown question type "${wpQ.type}" — skipping`)
  return null
}

// ---------------------------------------------------------------------------
// Result tracking
// ---------------------------------------------------------------------------

interface CourseResult {
  courseTitle: string
  status: 'seeded' | 'skipped' | 'error'
  questionsInserted: number
  unitDeleted: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function seedPosttests() {
  console.log('=== Posttest Seeding Script ===\n')

  // Load all 40 DB courses with empty posttest units
  const targetCourses = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .innerJoin(modules, eq(modules.courseId, courses.id))
    .innerJoin(units, eq(units.moduleId, modules.id))
    .leftJoin(learningBlocks, eq(learningBlocks.unitId, units.id))
    .where(sql`(${units.title} ILIKE '%posttest%' OR ${units.title} ILIKE '%post test%' OR ${units.title} ILIKE '%post-test%')`)
    .groupBy(courses.id, courses.title)
    .having(sql`COUNT(${learningBlocks.id}) = 0`)

  console.log(`Found ${targetCourses.length} courses with empty posttest units.\n`)

  const results: CourseResult[] = []

  for (const course of targetCourses) {
    const result: CourseResult = {
      courseTitle: course.title,
      status: 'error',
      questionsInserted: 0,
      unitDeleted: false,
    }

    try {
      // Guard: skip if post assessment already exists
      const existing = await db
        .select({ id: assessments.id })
        .from(assessments)
        .where(and(eq(assessments.courseId, course.id), eq(assessments.assessmentType, 'post')))
        .limit(1)

      if (existing.length > 0) {
        result.status = 'skipped'
        results.push(result)
        console.log(`  ⏭  Skipped "${course.title}" — post assessment already exists`)
        continue
      }

      // Find the WordPress folder for this course
      const folder = COURSE_FOLDER_MAP[course.title]
      if (!folder) {
        result.error = `No WordPress folder mapping found for course title`
        results.push(result)
        console.error(`  ✗ "${course.title}": no folder mapping — skipping`)
        continue
      }

      // Load posttest data from WordPress JSON
      const wpQuiz = loadWordPressPosttest(folder)
      if (!wpQuiz) {
        result.error = `No posttest quiz found in WordPress JSON`
        results.push(result)
        console.error(`  ✗ "${course.title}": no posttest quiz in JSON — skipping`)
        continue
      }

      console.log(`  → Processing "${course.title}" (${wpQuiz.questions.length} questions)...`)

      // Map questions, filter out nulls
      const mappedQuestions = wpQuiz.questions
        .map((q, i) => mapQuestion(q, i))
        .filter((q): q is NonNullable<typeof q> => q !== null)

      if (mappedQuestions.length === 0) {
        result.error = `All questions failed to map`
        results.push(result)
        console.error(`    ✗ No valid questions mapped`)
        continue
      }

      // Find the empty posttest unit ID for this course (to delete later)
      const emptyUnitRows = await db
        .select({ id: units.id, title: units.title })
        .from(units)
        .innerJoin(modules, eq(units.moduleId, modules.id))
        .leftJoin(learningBlocks, eq(learningBlocks.unitId, units.id))
        .where(
          and(
            eq(modules.courseId, course.id),
            sql`(${units.title} ILIKE '%posttest%' OR ${units.title} ILIKE '%post test%' OR ${units.title} ILIKE '%post-test%')`,
          )
        )
        .groupBy(units.id, units.title)
        .having(sql`COUNT(${learningBlocks.id}) = 0`)

      // Insert assessment + questions + delete unit in a transaction
      await db.transaction(async (tx) => {
        // Create the post assessment
        const [assessment] = await tx
          .insert(assessments)
          .values({
            courseId: course.id,
            title: wpQuiz.title,
            assessmentType: 'post',
            isGraded: true,
            passingScore: PASS_SCORE,
            showAnswers: SHOW_ANSWERS,
            maxAttempts: MAX_ATTEMPTS,
          })
          .returning({ id: assessments.id })

        // Insert all questions
        if (mappedQuestions.length > 0) {
          await tx.insert(assessmentQuestions).values(
            mappedQuestions.map(q => ({ ...q, assessmentId: assessment.id }))
          )
        }

        // Delete the empty posttest unit(s) for this course
        for (const emptyUnit of emptyUnitRows) {
          await tx.delete(units).where(eq(units.id, emptyUnit.id))
        }
      })

      result.status = 'seeded'
      result.questionsInserted = mappedQuestions.length
      result.unitDeleted = emptyUnitRows.length > 0
      results.push(result)

      console.log(`    ✓ Assessment created, ${mappedQuestions.length} questions inserted, ${emptyUnitRows.length} unit(s) deleted`)

    } catch (err) {
      result.error = String(err)
      results.push(result)
      console.error(`  ✗ "${course.title}" failed:`, err)
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  const seeded = results.filter(r => r.status === 'seeded')
  const skipped = results.filter(r => r.status === 'skipped')
  const errors = results.filter(r => r.status === 'error')

  console.log(`\n  Seeded:  ${seeded.length}`)
  console.log(`  Skipped: ${skipped.length}`)
  console.log(`  Errors:  ${errors.length}`)

  if (seeded.length > 0) {
    console.log('\n  Seeded courses:')
    for (const r of seeded) {
      console.log(`    ✓ ${r.courseTitle} — ${r.questionsInserted} questions, unit deleted: ${r.unitDeleted ? 'yes' : 'no'}`)
    }
  }

  if (errors.length > 0) {
    console.log('\n  Errors:')
    for (const r of errors) {
      console.log(`    ✗ ${r.courseTitle}: ${r.error}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Verification queries
  // ---------------------------------------------------------------------------

  console.log('\n' + '='.repeat(80))
  console.log('VERIFICATION')
  console.log('='.repeat(80))

  // Count post assessments
  const postAssessmentRows = await db
    .select({
      courseTitle: courses.title,
      assessmentTitle: assessments.title,
      passingScore: assessments.passingScore,
      showAnswers: assessments.showAnswers,
      questionCount: count(assessmentQuestions.id),
    })
    .from(assessments)
    .innerJoin(courses, eq(assessments.courseId, courses.id))
    .leftJoin(assessmentQuestions, eq(assessmentQuestions.assessmentId, assessments.id))
    .where(eq(assessments.assessmentType, 'post'))
    .groupBy(courses.title, assessments.title, assessments.passingScore, assessments.showAnswers)
    .orderBy(courses.title)

  console.log(`\n  Total post assessments in DB: ${postAssessmentRows.length}`)
  console.log('\n  Course | Questions | Pass% | ShowAnswers')
  console.log('  ' + '-'.repeat(70))
  for (const row of postAssessmentRows) {
    console.log(`  ${row.courseTitle.padEnd(40)} | ${String(row.questionCount).padStart(3)} Qs | ${row.passingScore}%  | ${row.showAnswers}`)
  }

  // Check for remaining empty posttest units
  const remainingEmptyUnits = await db
    .select({ id: units.id, title: units.title })
    .from(units)
    .leftJoin(learningBlocks, eq(learningBlocks.unitId, units.id))
    .where(sql`(${units.title} ILIKE '%posttest%' OR ${units.title} ILIKE '%post test%' OR ${units.title} ILIKE '%post-test%')`)
    .groupBy(units.id, units.title)
    .having(sql`COUNT(${learningBlocks.id}) = 0`)

  console.log(`\n  Remaining empty posttest units: ${remainingEmptyUnits.length}`)
  if (remainingEmptyUnits.length > 0) {
    console.log('  ⚠ These still need attention:')
    for (const u of remainingEmptyUnits) {
      console.log(`    - ${u.title} (id: ${u.id})`)
    }
  } else {
    console.log('  ✓ No empty posttest units remain.')
  }

  console.log('\nDone.\n')
  if (errors.length > 0) throw new Error(`${errors.length} course(s) failed to seed posttests`)
}

// @ts-ignore
if (import.meta.main) {
  seedPosttests().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
