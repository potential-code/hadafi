import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  assessmentAttempts,
  assessmentQuestions,
  assessments,
  blockQuestions,
  courseCertificates,
  courseEnrollments,
  courses,
  learnerActivityDays,
  learningBlocks,
  mentorAvailabilitySlots,
  mentorSessions,
  modules,
  questionAnswers,
  units,
  userCourseProgress,
  userUnitProgress,
  users,
} from "../db/schema";
import { AppError } from "../utils/app-error";
import { getStreak } from "./streak.service";

/**
 * One participant's full record for their organisation's partner contacts
 * (and admins): courses unit by unit, exam attempts with the answers given,
 * action plans and survey answers, certificates, mentor sessions, streak and
 * recent activity. Never another organisation's learner, and never a mentor's
 * private notes (mentor_sessions.mentor_notes, mentor_mentee_notes).
 * Ported from SMEEP 68d8fd4 without journeys, events, badges, the AI Examiner
 * and saved AI chats, which Hadafi doesn't have.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new AppError("Participant not found", 404, "NOT_FOUND");

/** The learner, if they belong to this organisation; otherwise a 404 (not "forbidden": don't confirm who exists). */
async function memberOf(organisationId: string, userId: string) {
  if (!UUID.test(userId) || !UUID.test(organisationId)) throw notFound();
  const [u] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      company: users.company,
      country: users.country,
      points: users.points,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organisationId, organisationId), eq(users.role, "sme")));
  if (!u) throw notFound();
  return u;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function courseRecords(userId: string) {
  const enrolled = await db
    .select({
      courseId: courses.id,
      title: courses.title,
      enrolledAt: courseEnrollments.enrolledAt,
      progress: userCourseProgress.progressPercentage,
      completedAt: userCourseProgress.completedAt,
    })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .leftJoin(userCourseProgress, and(eq(userCourseProgress.userId, userId), eq(userCourseProgress.courseId, courseEnrollments.courseId)))
    .where(eq(courseEnrollments.userId, userId))
    .orderBy(desc(courseEnrollments.enrolledAt));
  if (!enrolled.length) return [];
  const courseIds = enrolled.map((c) => c.courseId);

  const [unitRows, unitProgress, attempts, questions, answers] = await Promise.all([
    db
      .select({ courseId: modules.courseId, moduleTitle: modules.title, unitId: units.id, unitTitle: units.title })
      .from(units)
      .innerJoin(modules, eq(modules.id, units.moduleId))
      .where(inArray(modules.courseId, courseIds))
      .orderBy(asc(modules.order), asc(units.order)),
    db.select().from(userUnitProgress).where(eq(userUnitProgress.userId, userId)),
    db
      .select({ attempt: assessmentAttempts, courseId: assessments.courseId, type: assessments.assessmentType, title: assessments.title })
      .from(assessmentAttempts)
      .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
      .where(and(eq(assessmentAttempts.userId, userId), inArray(assessments.courseId, courseIds), isNotNull(assessmentAttempts.completedAt)))
      .orderBy(asc(assessmentAttempts.completedAt)),
    db
      .select({ q: assessmentQuestions })
      .from(assessmentQuestions)
      .innerJoin(assessments, eq(assessments.id, assessmentQuestions.assessmentId))
      .where(inArray(assessments.courseId, courseIds))
      .orderBy(asc(assessmentQuestions.order)),
    // Action plans and survey answers, with where they sit in the course.
    db
      .select({
        courseId: modules.courseId,
        unitTitle: units.title,
        kind: blockQuestions.kind,
        format: blockQuestions.format,
        prompt: blockQuestions.prompt,
        options: blockQuestions.options,
        answer: questionAnswers.answerData,
        submittedAt: questionAnswers.submittedAt,
      })
      .from(questionAnswers)
      .innerJoin(blockQuestions, eq(blockQuestions.id, questionAnswers.questionId))
      .innerJoin(learningBlocks, eq(learningBlocks.id, blockQuestions.blockId))
      .innerJoin(units, eq(units.id, learningBlocks.unitId))
      .innerJoin(modules, eq(modules.id, units.moduleId))
      .where(and(eq(questionAnswers.userId, userId), inArray(modules.courseId, courseIds)))
      .orderBy(asc(modules.order), asc(units.order), asc(blockQuestions.order)),
  ]);

  const unitStatus = new Map(unitProgress.map((p) => [p.unitId, p]));
  const questionsByAssessment = new Map<string, (typeof questions)[number]["q"][]>();
  for (const { q } of questions) {
    const list = questionsByAssessment.get(q.assessmentId) ?? [];
    list.push(q);
    questionsByAssessment.set(q.assessmentId, list);
  }

  return enrolled.map((c) => ({
    courseId: c.courseId,
    title: c.title,
    enrolledAt: iso(c.enrolledAt),
    progress: Math.round(c.progress ?? 0),
    completedAt: iso(c.completedAt),
    units: unitRows
      .filter((u) => u.courseId === c.courseId)
      .map((u) => {
        const p = unitStatus.get(u.unitId);
        return { module: u.moduleTitle, title: u.unitTitle, status: p?.status ?? "not_started", completedAt: iso(p?.completedAt) };
      }),
    exams: attempts
      .filter((a) => a.courseId === c.courseId)
      .map((a) => {
        const qs = questionsByAssessment.get(a.attempt.assessmentId) ?? [];
        const given = a.attempt.answers ?? {};
        return {
          type: a.type,
          title: a.title,
          attempt: a.attempt.attemptNumber,
          score: a.attempt.score,
          passed: a.attempt.passed,
          completedAt: iso(a.attempt.completedAt),
          answers: qs.map((q) => {
            const chosen = given[q.id];
            return {
              question: q.questionText,
              options: q.options,
              chosen: typeof chosen === "number" ? chosen : null,
              correct: q.correctAnswer,
              isCorrect: typeof chosen === "number" ? chosen === q.correctAnswer : false,
            };
          }),
        };
      }),
    responses: answers
      .filter((r) => r.courseId === c.courseId)
      .map((r) => ({
        kind: r.kind,
        unit: r.unitTitle,
        prompt: r.prompt,
        answer:
          r.answer.openEndedAnswer?.trim() ||
          (typeof r.answer.selectedAnswer === "number"
            ? r.format === "true-false"
              ? r.answer.selectedAnswer === 0
                ? "True"
                : "False"
              : (r.options?.[r.answer.selectedAnswer] ?? `Option ${r.answer.selectedAnswer + 1}`)
            : ""),
        submittedAt: iso(r.submittedAt),
      })),
  }));
}

export async function participantRecord(organisationId: string, userId: string) {
  const profile = await memberOf(organisationId, userId);
  const [coursesData, certificates, sessions, streak, activityDays] = await Promise.all([
    courseRecords(userId),
    db
      .select({
        number: courseCertificates.certificateNumber,
        course: courses.title,
        issuedAt: courseCertificates.issuedAt,
        status: courseCertificates.status,
      })
      .from(courseCertificates)
      .innerJoin(courses, eq(courses.id, courseCertificates.courseId))
      .where(eq(courseCertificates.userId, userId))
      .orderBy(desc(courseCertificates.issuedAt)),
    // Never the mentor's own notes: only when, with whom and how it went.
    db
      .select({
        status: mentorSessions.status,
        cancelledBy: mentorSessions.cancelledBy,
        bookedAt: mentorSessions.bookedAt,
        startsAt: mentorAvailabilitySlots.startsAt,
        endsAt: mentorAvailabilitySlots.endsAt,
        mentorName: users.fullName,
      })
      .from(mentorSessions)
      .innerJoin(mentorAvailabilitySlots, eq(mentorAvailabilitySlots.id, mentorSessions.slotId))
      .innerJoin(users, eq(users.id, mentorSessions.mentorUserId))
      .where(eq(mentorSessions.smeUserId, userId))
      .orderBy(desc(mentorAvailabilitySlots.startsAt)),
    getStreak(userId),
    db
      .select({ day: learnerActivityDays.day, steps: learnerActivityDays.steps })
      .from(learnerActivityDays)
      .where(and(eq(learnerActivityDays.userId, userId), sql`${learnerActivityDays.day} >= (current_date - 60)`)),
  ]);

  // Recent activity: the latest things they did, newest first.
  const activity: { at: string; kind: string; text: string }[] = [];
  for (const c of coursesData) {
    if (c.enrolledAt) activity.push({ at: c.enrolledAt, kind: "course", text: `Started ${c.title}` });
    for (const u of c.units) if (u.completedAt) activity.push({ at: u.completedAt, kind: "unit", text: `Finished “${u.title}” (${c.title})` });
    for (const x of c.exams)
      if (x.completedAt)
        activity.push({ at: x.completedAt, kind: "exam", text: `${x.type === "pre" ? "Pre-test" : "Final exam"} for ${c.title}: ${x.score ?? "–"}%` });
    if (c.completedAt) activity.push({ at: c.completedAt, kind: "course_done", text: `Completed ${c.title}` });
  }
  for (const cert of certificates) activity.push({ at: cert.issuedAt.toISOString(), kind: "certificate", text: `Certificate for ${cert.course}` });
  for (const s of sessions) activity.push({ at: s.bookedAt.toISOString(), kind: "mentor", text: `Booked a session with ${s.mentorName}` });
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return {
    profile: { ...profile, createdAt: profile.createdAt.toISOString(), lastActiveAt: iso(profile.lastActiveAt) },
    streak: {
      current: streak.currentStreak,
      longest: streak.longestStreak,
      week: streak.week,
      activeDaysLast60: activityDays.filter((d) => d.steps > 0).length,
    },
    activity: activity.slice(0, 40),
    courses: coursesData,
    certificates: certificates.map((c) => ({ ...c, issuedAt: c.issuedAt.toISOString() })),
    mentorSessions: sessions.map((s) => ({
      mentorName: s.mentorName,
      startsAt: s.startsAt.toISOString(),
      minutes: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000),
      status: s.status,
      cancelledBy: s.cancelledBy,
      bookedAt: s.bookedAt.toISOString(),
    })),
  };
}

export type ParticipantRecord = Awaited<ReturnType<typeof participantRecord>>;
