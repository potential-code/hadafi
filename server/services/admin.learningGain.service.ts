import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Learning gain: how much learners improve on a course between the pre-test
 * (their first completed attempt: what they knew before) and the final exam
 * (their best completed attempt). Only learners who have done both count, so
 * every figure is a like-for-like before/after for the same person and course.
 * Ported from SMEEP's admin.learningGain.service.ts (205bf7a).
 */

export interface LearningGainCourse {
  courseId: string;
  course: string;
  learners: number;
  avgPre: number;
  avgPost: number;
  avgGain: number;
}

export interface LearningGainLearner {
  learner: string;
  email: string;
  course: string;
  preScore: number;
  postScore: number;
  gain: number;
  preAt: string;
  postAt: string;
}

export interface LearningGain {
  /** Learner–course pairs with both a pre-test and a final exam. */
  pairs: number;
  avgPre: number | null;
  avgPost: number | null;
  /** Average change in percentage points (post − pre). */
  avgGain: number | null;
  /** Share of pairs whose final score is higher than their pre-test. */
  improvedPct: number | null;
  courses: LearningGainCourse[];
}

/** Optional scope: one partner organisation's learners. */
export interface LearnerScope {
  organisationId?: string;
}

/** "AND <alias>.organisation_id = …" when scoped. `alias` is always a literal from our own SQL. */
export const orgOf = (alias: string, scope: LearnerScope) =>
  scope.organisationId ? sql`AND ${sql.raw(alias)}.organisation_id = ${scope.organisationId}` : sql``;

const PAIRS = (scope: LearnerScope = {}) => sql`
  WITH attempts AS (
    SELECT aa.user_id, s.course_id, s.assessment_type, aa.score, aa.completed_at
    FROM assessment_attempts aa
    JOIN assessments s ON s.id = aa.assessment_id
    WHERE aa.completed_at IS NOT NULL AND aa.score IS NOT NULL
  ),
  pre AS (
    SELECT DISTINCT ON (user_id, course_id) user_id, course_id, score, completed_at
    FROM attempts WHERE assessment_type = 'pre'
    ORDER BY user_id, course_id, completed_at ASC
  ),
  post AS (
    SELECT DISTINCT ON (user_id, course_id) user_id, course_id, score, completed_at
    FROM attempts WHERE assessment_type = 'post'
    ORDER BY user_id, course_id, score DESC, completed_at ASC
  )
  SELECT pre.user_id, pre.course_id, pre.score AS pre_score, post.score AS post_score,
         pre.completed_at AS pre_at, post.completed_at AS post_at
  FROM pre JOIN post USING (user_id, course_id)
  JOIN users u ON u.id = pre.user_id AND u.role = 'sme' ${orgOf("u", scope)}
`;

const round1 = (n: number) => Math.round(n * 10) / 10;
const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();

export async function getLearningGain(scope: LearnerScope = {}): Promise<LearningGain> {
  const [summaryRes, coursesRes] = await Promise.all([
    db.execute(sql`
      WITH p AS (${PAIRS(scope)})
      SELECT count(*)::int AS pairs,
             avg(pre_score)::float AS avg_pre,
             avg(post_score)::float AS avg_post,
             avg(post_score - pre_score)::float AS avg_gain,
             (100.0 * count(*) FILTER (WHERE post_score > pre_score) / nullif(count(*), 0))::float AS improved_pct
      FROM p
    `),
    db.execute(sql`
      WITH p AS (${PAIRS(scope)})
      SELECT p.course_id, c.title, count(*)::int AS learners,
             avg(pre_score)::float AS avg_pre, avg(post_score)::float AS avg_post,
             avg(post_score - pre_score)::float AS avg_gain
      FROM p JOIN courses c ON c.id = p.course_id
      GROUP BY p.course_id, c.title
      ORDER BY learners DESC, avg_gain DESC
      LIMIT 50
    `),
  ]);
  const summary = (summaryRes.rows[0] ?? {}) as Record<string, number | null>;
  const courses = coursesRes.rows as Record<string, unknown>[];

  const pairs = Number(summary.pairs ?? 0);
  return {
    pairs,
    avgPre: pairs ? Math.round(Number(summary.avg_pre)) : null,
    avgPost: pairs ? Math.round(Number(summary.avg_post)) : null,
    avgGain: pairs ? round1(Number(summary.avg_gain)) : null,
    improvedPct: pairs ? Math.round(Number(summary.improved_pct)) : null,
    courses: courses.map((r) => ({
      courseId: String(r.course_id),
      course: String(r.title),
      learners: Number(r.learners),
      avgPre: Math.round(Number(r.avg_pre)),
      avgPost: Math.round(Number(r.avg_post)),
      avgGain: round1(Number(r.avg_gain)),
    })),
  };
}

/** One row per learner and course, for the export. */
export async function listLearningGain(scope: LearnerScope = {}): Promise<LearningGainLearner[]> {
  const res = await db.execute(sql`
    WITH p AS (${PAIRS(scope)})
    SELECT u.full_name, u.email, c.title, p.pre_score, p.post_score, p.pre_at, p.post_at
    FROM p JOIN users u ON u.id = p.user_id JOIN courses c ON c.id = p.course_id
    ORDER BY c.title, u.full_name
  `);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    learner: String(r.full_name),
    email: String(r.email),
    course: String(r.title),
    preScore: Number(r.pre_score),
    postScore: Number(r.post_score),
    gain: Number(r.post_score) - Number(r.pre_score),
    preAt: iso(r.pre_at),
    postAt: iso(r.post_at),
  }));
}
