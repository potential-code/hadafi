import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * The admin home's impact view and the Analytics page's highlights: what
 * Hadafi has done for women entrepreneurs, counted from learning activity
 * rather than sign-ups alone. Ported from SMEEP's admin.impact.service.ts
 * (9c89f63, 09045cd), keeping only what Hadafi records: courses, lessons,
 * pre-tests and final exams, certificates, human mentor sessions and partner
 * offers. Hadafi has no learning journeys or AI Examiner, so those are left out.
 *
 * Learners are users with role 'sme'.
 */

export interface ImpactSummary {
  learners: number;
  newLearners30d: number;
  activeLearners30d: number;
  countries: number;
  enrolments: number;
  lessonsCompleted: number;
  coursesCompleted: number;
  certificates: number;
  mentorSessions: number;
  finalExams: number;
  finalExamAvgScore: number | null;
  offersRedeemed: number;
}

export interface ImpactMonth {
  month: string; // "2026-10"
  activeLearners: number;
  lessonsCompleted: number;
  coursesCompleted: number;
  certificates: number;
}

export interface Impact {
  summary: ImpactSummary;
  monthly: ImpactMonth[];
  /** Learners who have used each part of Hadafi. */
  uses: { label: string; learners: number }[];
  countries: { country: string; learners: number }[];
}

const num = (v: unknown) => Number(v ?? 0);
type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await db.execute(q)).rows as Row[];
const one = async (q: ReturnType<typeof sql>): Promise<Row> => (await rows(q))[0] ?? {};

// Countries are stored as names, except sign-ups that stored ISO codes ("AE"):
// fold those into names so a country isn't counted twice.
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export function countryLabel(raw: string): string {
  const v = raw.trim();
  if (/^[A-Za-z]{2}$/.test(v)) {
    try {
      return regionNames.of(v.toUpperCase()) ?? v;
    } catch {
      return v;
    }
  }
  return v;
}

function foldCountries(list: Row[]): { country: string; learners: number }[] {
  const byCountry = new Map<string, number>();
  for (const r of list) {
    const label = countryLabel(String(r["country"]));
    byCountry.set(label, (byCountry.get(label) ?? 0) + num(r["n"]));
  }
  return [...byCountry.entries()]
    .map(([country, learners]) => ({ country, learners }))
    .sort((a, b) => b.learners - a.learners || a.country.localeCompare(b.country));
}

/** The last 12 months as "YYYY-MM", oldest first. */
function last12Months(now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const COUNTRY_ROWS = sql`
  SELECT country, count(*) AS n FROM users
  WHERE role = 'sme' AND coalesce(trim(country), '') <> ''
  GROUP BY country
`;

export async function getImpact(): Promise<Impact> {
  const [s, countryRows, uses, active, lessonsByMonth, coursesByMonth, certsByMonth] = await Promise.all([
    one(sql`
      SELECT
        (SELECT count(*) FROM users WHERE role = 'sme') AS learners,
        (SELECT count(*) FROM users WHERE role = 'sme' AND created_at >= now() - interval '30 days') AS new_learners,
        (SELECT count(DISTINCT user_id) FROM learner_activity_days WHERE day >= current_date - 30) AS active_30d,
        (SELECT count(*) FROM course_enrollments) AS enrolments,
        (SELECT count(*) FROM user_learning_block_progress WHERE status = 'completed') AS lessons,
        (SELECT count(*) FROM user_course_progress WHERE completed_at IS NOT NULL) AS courses_completed,
        (SELECT count(*) FROM course_certificates WHERE status = 'active') AS certificates,
        (SELECT count(*) FROM mentor_sessions WHERE status <> 'cancelled') AS mentor_sessions,
        (SELECT count(*) FROM assessment_attempts aa JOIN assessments a ON a.id = aa.assessment_id
          WHERE a.assessment_type = 'post' AND aa.completed_at IS NOT NULL) AS final_exams,
        (SELECT round(avg(aa.score)) FROM assessment_attempts aa JOIN assessments a ON a.id = aa.assessment_id
          WHERE a.assessment_type = 'post' AND aa.completed_at IS NOT NULL AND aa.score IS NOT NULL) AS final_exam_avg,
        (SELECT count(*) FROM offer_redemptions) AS offers_redeemed
    `),
    rows(COUNTRY_ROWS),
    one(sql`
      SELECT
        (SELECT count(DISTINCT user_id) FROM course_enrollments) AS courses,
        (SELECT count(DISTINCT aa.user_id) FROM assessment_attempts aa JOIN assessments a ON a.id = aa.assessment_id
          WHERE a.assessment_type = 'pre' AND aa.completed_at IS NOT NULL) AS pre_tests,
        (SELECT count(DISTINCT aa.user_id) FROM assessment_attempts aa JOIN assessments a ON a.id = aa.assessment_id
          WHERE a.assessment_type = 'post' AND aa.completed_at IS NOT NULL) AS final_exams,
        (SELECT count(DISTINCT sme_user_id) FROM mentor_sessions WHERE status <> 'cancelled') AS mentors,
        (SELECT count(DISTINCT user_id) FROM offer_redemptions) AS offers
    `),
    rows(sql`
      SELECT to_char(date_trunc('month', day), 'YYYY-MM') AS month, count(DISTINCT user_id) AS n
      FROM learner_activity_days WHERE day >= date_trunc('month', current_date) - interval '11 months'
      GROUP BY 1
    `),
    rows(sql`
      SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month, count(*) AS n
      FROM user_learning_block_progress
      WHERE status = 'completed' AND completed_at >= date_trunc('month', current_date) - interval '11 months'
      GROUP BY 1
    `),
    rows(sql`
      SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month, count(*) AS n
      FROM user_course_progress
      WHERE completed_at >= date_trunc('month', current_date) - interval '11 months'
      GROUP BY 1
    `),
    rows(sql`
      SELECT to_char(date_trunc('month', issued_at), 'YYYY-MM') AS month, count(*) AS n
      FROM course_certificates
      WHERE status = 'active' AND issued_at >= date_trunc('month', current_date) - interval '11 months'
      GROUP BY 1
    `),
  ]);

  const countries = foldCountries(countryRows);
  const index = (list: Row[]) => new Map(list.map((r) => [String(r["month"]), num(r["n"])]));
  const [a, l, c, ce] = [index(active), index(lessonsByMonth), index(coursesByMonth), index(certsByMonth)];

  return {
    summary: {
      learners: num(s["learners"]),
      newLearners30d: num(s["new_learners"]),
      activeLearners30d: num(s["active_30d"]),
      countries: countries.length,
      enrolments: num(s["enrolments"]),
      lessonsCompleted: num(s["lessons"]),
      coursesCompleted: num(s["courses_completed"]),
      certificates: num(s["certificates"]),
      mentorSessions: num(s["mentor_sessions"]),
      finalExams: num(s["final_exams"]),
      finalExamAvgScore: s["final_exam_avg"] == null ? null : num(s["final_exam_avg"]),
      offersRedeemed: num(s["offers_redeemed"]),
    },
    monthly: last12Months().map((month) => ({
      month,
      activeLearners: a.get(month) ?? 0,
      lessonsCompleted: l.get(month) ?? 0,
      coursesCompleted: c.get(month) ?? 0,
      certificates: ce.get(month) ?? 0,
    })),
    uses: [
      { label: "Courses", learners: num(uses["courses"]) },
      { label: "Pre-tests", learners: num(uses["pre_tests"]) },
      { label: "Final exams", learners: num(uses["final_exams"]) },
      { label: "Mentor sessions", learners: num(uses["mentors"]) },
      { label: "Partner offers", learners: num(uses["offers"]) },
    ],
    countries: countries.slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Analytics page: range KPIs with change vs the previous period, and charts
// ---------------------------------------------------------------------------

export type InsightRange = "7d" | "30d" | "12m";
export const INSIGHT_RANGES: readonly InsightRange[] = ["7d", "30d", "12m"];

export interface KpiDelta {
  current: number;
  previous: number;
}

export interface AnalyticsInsights {
  range: InsightRange;
  kpis: {
    newLearners: KpiDelta;
    activeLearners: KpiDelta;
    enrolments: KpiDelta;
    lessonsCompleted: KpiDelta;
    coursesCompleted: KpiDelta;
    certificates: KpiDelta;
    mentorSessions: KpiDelta;
    finalExams: KpiDelta;
    finalExamAvgScore: number | null;
  };
  /** One point per day (7d, 30d) or month (12m), oldest first. */
  series: {
    bucket: string;
    newLearners: number;
    activeLearners: number;
    lessonsCompleted: number;
    sessionsBooked: number;
    sessionsCompleted: number;
    sessionsCancelled: number;
  }[];
  /** All time, learners only: how far learners get. */
  funnel: { step: string; learners: number }[];
  /** What learners started in the period. */
  activityMix: { label: string; count: number }[];
  /** Final exam attempts in the period, by score. */
  examScores: { band: string; attempts: number }[];
  /** Share of final exam attempts in the period that passed. */
  examPassRate: number | null;
  weekdays: { day: string; activeLearners: number }[];
  countries: { country: string; learners: number }[];
}

const RANGE_DAYS: Record<InsightRange, number> = { "7d": 7, "30d": 30, "12m": 365 };

/** Bucket keys, oldest first, in UTC to match Postgres' to_char on UTC timestamps. */
export function insightBuckets(range: InsightRange, now = new Date()): string[] {
  const out: string[] = [];
  if (range === "12m") {
    for (let i = 11; i >= 0; i--) {
      const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }
  for (let i = RANGE_DAYS[range] - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function getAnalyticsInsights(range: InsightRange): Promise<AnalyticsInsights> {
  const days = RANGE_DAYS[range];
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const before = new Date(since.getTime() - days * 86_400_000);
  const unit = range === "12m" ? "month" : "day";
  const fmt = range === "12m" ? "YYYY-MM" : "YYYY-MM-DD";
  // The chart starts at the first bucket, which can begin before `since`.
  const seriesFrom = sql`date_trunc(${unit}, ${since}::timestamp)`;

  // One query per window; the same SQL counts the current and the previous period.
  const windowCounts = (from: Date, to: Date) =>
    one(sql`
      SELECT
        (SELECT count(*) FROM users WHERE role = 'sme' AND created_at >= ${from} AND created_at < ${to}) AS new_learners,
        (SELECT count(DISTINCT user_id) FROM learner_activity_days WHERE day >= ${from}::date AND day < ${to}::date) AS active_learners,
        (SELECT count(*) FROM course_enrollments WHERE enrolled_at >= ${from} AND enrolled_at < ${to}) AS enrolments,
        (SELECT count(*) FROM user_learning_block_progress WHERE status = 'completed' AND completed_at >= ${from} AND completed_at < ${to}) AS lessons,
        (SELECT count(*) FROM user_course_progress WHERE completed_at >= ${from} AND completed_at < ${to}) AS courses,
        (SELECT count(*) FROM course_certificates WHERE status = 'active' AND issued_at >= ${from} AND issued_at < ${to}) AS certificates,
        (SELECT count(*) FROM mentor_sessions WHERE status <> 'cancelled' AND booked_at >= ${from} AND booked_at < ${to}) AS sessions,
        (SELECT count(*) FROM assessment_attempts aa JOIN assessments a ON a.id = aa.assessment_id
          WHERE a.assessment_type = 'post' AND aa.completed_at >= ${from} AND aa.completed_at < ${to}) AS exams,
        (SELECT round(avg(aa.score)) FROM assessment_attempts aa JOIN assessments a ON a.id = aa.assessment_id
          WHERE a.assessment_type = 'post' AND aa.score IS NOT NULL AND aa.completed_at >= ${from} AND aa.completed_at < ${to}) AS exam_avg
    `);

  const [cur, prev, learnerSeries, activeSeries, lessonSeries, sessionSeries, funnel, mix, scores, weekdays, countryRows] =
    await Promise.all([
      windowCounts(since, now),
      windowCounts(before, since),
      rows(sql`
        SELECT to_char(date_trunc(${unit}, created_at), ${fmt}) AS b, count(*) AS n
        FROM users WHERE role = 'sme' AND created_at >= ${seriesFrom} GROUP BY 1`),
      rows(sql`
        SELECT to_char(date_trunc(${unit}, day), ${fmt}) AS b, count(DISTINCT user_id) AS n
        FROM learner_activity_days WHERE day >= ${seriesFrom} GROUP BY 1`),
      rows(sql`
        SELECT to_char(date_trunc(${unit}, completed_at), ${fmt}) AS b, count(*) AS n
        FROM user_learning_block_progress
        WHERE status = 'completed' AND completed_at >= ${seriesFrom} GROUP BY 1`),
      rows(sql`
        SELECT to_char(date_trunc(${unit}, booked_at), ${fmt}) AS b,
          count(*) FILTER (WHERE status <> 'cancelled') AS booked,
          count(*) FILTER (WHERE status = 'completed') AS completed,
          count(*) FILTER (WHERE status = 'cancelled') AS cancelled
        FROM mentor_sessions WHERE booked_at >= ${seriesFrom} GROUP BY 1`),
      one(sql`
        WITH learners AS (SELECT id FROM users WHERE role = 'sme')
        SELECT
          (SELECT count(*) FROM learners) AS registered,
          (SELECT count(*) FROM learners l WHERE EXISTS (SELECT 1 FROM course_enrollments e WHERE e.user_id = l.id)) AS enrolled,
          (SELECT count(*) FROM learners l WHERE EXISTS (
             SELECT 1 FROM user_learning_block_progress x WHERE x.user_id = l.id AND x.status = 'completed')) AS lesson,
          (SELECT count(*) FROM learners l WHERE EXISTS (
             SELECT 1 FROM user_course_progress p WHERE p.user_id = l.id AND p.completed_at IS NOT NULL)) AS course,
          (SELECT count(*) FROM learners l WHERE EXISTS (
             SELECT 1 FROM course_certificates c WHERE c.user_id = l.id AND c.status = 'active')) AS certified
      `),
      one(sql`
        SELECT
          (SELECT count(*) FROM course_enrollments WHERE enrolled_at >= ${since}) AS courses,
          (SELECT count(*) FROM assessment_attempts aa JOIN assessments a ON a.id = aa.assessment_id
            WHERE a.assessment_type = 'pre' AND aa.completed_at >= ${since}) AS pre_tests,
          (SELECT count(*) FROM assessment_attempts aa JOIN assessments a ON a.id = aa.assessment_id
            WHERE a.assessment_type = 'post' AND aa.completed_at >= ${since}) AS final_exams,
          (SELECT count(*) FROM mentor_sessions WHERE status <> 'cancelled' AND booked_at >= ${since}) AS mentors,
          (SELECT count(*) FROM offer_redemptions WHERE redeemed_at >= ${since}) AS offers
      `),
      rows(sql`
        SELECT CASE WHEN aa.score >= 80 THEN '80-100' WHEN aa.score >= 60 THEN '60-79'
                    WHEN aa.score >= 40 THEN '40-59' ELSE '0-39' END AS band,
               count(*) AS n,
               count(*) FILTER (WHERE aa.passed) AS passed
        FROM assessment_attempts aa JOIN assessments a ON a.id = aa.assessment_id
        WHERE a.assessment_type = 'post' AND aa.score IS NOT NULL AND aa.completed_at >= ${since}
        GROUP BY 1`),
      rows(sql`
        SELECT extract(isodow FROM day)::int AS d, count(DISTINCT user_id) AS n
        FROM learner_activity_days WHERE day >= ${since}::date GROUP BY 1`),
      rows(COUNTRY_ROWS),
    ]);

  const delta = (k: string): KpiDelta => ({ current: num(cur[k]), previous: num(prev[k]) });
  const idx = (list: Row[], key = "n") => new Map(list.map((r) => [String(r["b"]), num(r[key])]));
  const [ln, ac, ls, sb, sc, sx] = [
    idx(learnerSeries),
    idx(activeSeries),
    idx(lessonSeries),
    idx(sessionSeries, "booked"),
    idx(sessionSeries, "completed"),
    idx(sessionSeries, "cancelled"),
  ];
  const scoreMap = new Map(scores.map((r) => [String(r["band"]), num(r["n"])]));
  const attempts = scores.reduce((n, r) => n + num(r["n"]), 0);
  const passed = scores.reduce((n, r) => n + num(r["passed"]), 0);
  const dayMap = new Map(weekdays.map((r) => [num(r["d"]), num(r["n"])]));

  return {
    range,
    kpis: {
      newLearners: delta("new_learners"),
      activeLearners: delta("active_learners"),
      enrolments: delta("enrolments"),
      lessonsCompleted: delta("lessons"),
      coursesCompleted: delta("courses"),
      certificates: delta("certificates"),
      mentorSessions: delta("sessions"),
      finalExams: delta("exams"),
      finalExamAvgScore: cur["exam_avg"] == null ? null : num(cur["exam_avg"]),
    },
    series: insightBuckets(range, now).map((b) => ({
      bucket: b,
      newLearners: ln.get(b) ?? 0,
      activeLearners: ac.get(b) ?? 0,
      lessonsCompleted: ls.get(b) ?? 0,
      sessionsBooked: sb.get(b) ?? 0,
      sessionsCompleted: sc.get(b) ?? 0,
      sessionsCancelled: sx.get(b) ?? 0,
    })),
    funnel: [
      { step: "Registered", learners: num(funnel["registered"]) },
      { step: "Enrolled in a course", learners: num(funnel["enrolled"]) },
      { step: "Completed a lesson", learners: num(funnel["lesson"]) },
      { step: "Completed a course", learners: num(funnel["course"]) },
      { step: "Earned a certificate", learners: num(funnel["certified"]) },
    ],
    activityMix: [
      { label: "Course enrolments", count: num(mix["courses"]) },
      { label: "Pre-tests taken", count: num(mix["pre_tests"]) },
      { label: "Final exams taken", count: num(mix["final_exams"]) },
      { label: "Mentor sessions", count: num(mix["mentors"]) },
      { label: "Offers redeemed", count: num(mix["offers"]) },
    ],
    examScores: ["0-39", "40-59", "60-79", "80-100"].map((band) => ({ band, attempts: scoreMap.get(band) ?? 0 })),
    examPassRate: attempts ? Math.round((100 * passed) / attempts) : null,
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => ({ day, activeLearners: dayMap.get(i + 1) ?? 0 })),
    countries: foldCountries(countryRows).slice(0, 10),
  };
}
