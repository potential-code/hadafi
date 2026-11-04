/**
 * The Multi Learning page's own labels. They stay English in every language
 * (Hadafi's decision): the learner's language changes the course content,
 * which the server translates, and Hana's words, not the app around them.
 */

import type { LearnerLanguage } from './api'

/** The languages Learn with Hana offers. Each label is written in its own language. */
export const LANGUAGES: ReadonlyArray<{ code: LearnerLanguage; label: string; short: string; name: string; dir: 'ltr' | 'rtl' }> = [
  { code: 'en', label: 'English', short: 'EN', name: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', short: 'ع', name: 'Arabic', dir: 'rtl' },
  { code: 'ur', label: 'اردو', short: 'اردو', name: 'Urdu', dir: 'rtl' },
]

export function isLearnerLanguage(value: unknown): value is LearnerLanguage {
  return value === 'en' || value === 'ar' || value === 'ur'
}

/** Direction of course content in a language. The page around it stays left to right. */
export function directionOf(lang: LearnerLanguage): 'ltr' | 'rtl' {
  return lang === 'ar' || lang === 'ur' ? 'rtl' : 'ltr'
}

const RTL_SCRIPT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/**
 * Direction for one piece of course content: right to left when it is in
 * Arabic script (Arabic, Urdu), otherwise the browser decides (`auto`). Per
 * string, not per language, so a line that fell back to English stays left
 * to right, and an Arabic line that opens with "Hadafi" still reads right to
 * left. Only content gets a direction; the page's own labels never do.
 */
export function contentDir(text: string | null | undefined): 'rtl' | 'auto' {
  return text && RTL_SCRIPT.test(text) ? 'rtl' : 'auto'
}

/** What the dictation mic listens for (as SMEEP). */
export const RECOGNITION_LOCALE: Record<LearnerLanguage, string> = {
  en: 'en-US',
  ar: 'ar-AE',
  ur: 'ur-PK',
}

export const ui = {
  pageTitle: 'Learn with Hana',
  pageSubtitle: 'Hana takes you through this course one step at a time',
  placeholder: 'Reply to Hana, or ask her anything about the lesson',
  placeholderShort: 'Reply to Hana',
  couldNotLoad: 'This step could not load.',
  tryAgain: 'Try again',
  continue: 'Continue',
  done: 'Done',
  yourCourses: 'Your courses',
  pickOne: 'Pick one to learn with Hana',
  noCourses: 'Start a course from the Courses page and Hana will take you through it here.',
  start: 'Start',
  resume: 'Resume',
  review: 'Review',
  complete: 'Complete',
  notStarted: 'Not started',
  introductionKind: 'Introduction',
  unitN: (n: number) => `Unit ${n}`,
  letsBegin: 'Here is a new unit. Hana will guide you through it.',
  whatYoullLearn: 'What you will learn',
  videoKind: 'Video',
  watchToContinue: 'Watch the video to continue',
  watched: 'Watched',
  transcript: 'Transcript',
  readingKind: 'Reading',
  keyPoints: 'Key points',
  actionPlanKind: 'Action plan',
  actionPlanHint: 'In your own words. Hana can help with ideas.',
  checkInKind: 'Unit check-in',
  checkInHint: 'There are no wrong answers.',
  planPlaceholder: 'Write your plan here',
  answerPlaceholder: 'Write your answer here',
  savePlan: 'Save my plan',
  saveAnswers: 'Save my answers',
  saving: 'Saving',
  saved: 'Saved',
  finalExamKind: 'Final exam',
  preTestKind: 'Pre-test',
  preTestHint: 'A quick check before you start',
  startingPoint: 'Your starting point',
  lessonsOpen: 'The lessons are open.',
  questionOf: (i: number, total: number) => `Question ${i} of ${total}`,
  attemptsLeft: (n: number) => (n === 1 ? '1 attempt left' : `${n} attempts left`),
  previous: 'Previous',
  next: 'Next',
  submit: 'Submit',
  submitting: 'Submitting',
  passedTitle: 'Passed',
  notPassedTitle: 'Not passed yet',
  takenTitle: 'Done',
  correctOf: (c: number, total: number) => `${c} of ${total} correct`,
  passMark: (p: number) => `pass mark ${p}%`,
  noAttemptsLeft: 'No attempts left. The Hadafi team can reset it for you.',
  alreadyPassed: 'You have already passed this.',
  lockedQuiz: 'This opens once every unit is done.',
  openCourseMessage: (name: string) => `Let's start "${name}".`,
  unitsComplete: (done: number, total: number) => `${done} of ${total} units complete`,
  courseComplete: 'Course complete',
  showProgress: 'Course progress',
  hideRail: 'Hide course progress',
  showRail: 'Show course progress',
  close: 'Close',
  bestScore: (s: number) => `best ${s}%`,
  nowStep: (step: string) => `Now: ${step}`,
  earnsCertificate: 'Pass it to earn your certificate',
  classicView: 'Course page',
  classicViewLong: 'Open the course page',
  language: 'Language',
  languageOf: (name: string) => `Learn in ${name}`,
}

export type TutorStrings = typeof ui
