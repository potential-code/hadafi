import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  courseCertificates,
  courseEnrollments,
  courses,
  mentorRegistrations,
  stakeholderRegistrations,
  userCourseProgress,
  users,
} from "../db/schema";

// ---------------------------------------------------------------------------
// Range helpers (Tasks 3+)
// ---------------------------------------------------------------------------

/** Supported time-range identifiers for analytics queries. */
export type AnalyticsRange = "7d" | "30d" | "12m";

/**
 * Converts an AnalyticsRange token into a concrete start Date.
 * "7d"  → now minus 7 days
 * "30d" → now minus 30 days
 * "12m" → same calendar month, one year ago
 */
export function rangeToStartDate(range: AnalyticsRange): Date {
  const now = new Date();
  if (range === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  // "12m"
  const d = new Date(now);
  d.setMonth(d.getMonth() - 12);
  return d;
}

// ---------------------------------------------------------------------------
// Overview KPIs (Task 3)
// ---------------------------------------------------------------------------

export interface OverviewKpis {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  activeLearners: number;
  enrolledLearners: number;
  totalCourses: number;
  certificatesIssued: number;
}

/**
 * Returns seven headline KPI counts scoped to the given range.
 * - totalUsers: all-time registered users (range-independent)
 * - activeUsers: users with lastActiveAt within the range
 * - newUsers: users created within the range
 * - activeLearners: distinct users with any course-progress update in range
 * - enrolledLearners: distinct users with an active enrollment (all-time)
 * - totalCourses: published courses (all-time)
 * - certificatesIssued: active certificates (all-time)
 */
export async function getOverviewKpis(range: AnalyticsRange): Promise<OverviewKpis> {
  const since = rangeToStartDate(range);

  const [
    [{ totalUsers }],
    [{ activeUsers }],
    [{ newUsers }],
    [{ activeLearners }],
    [{ enrolledLearners }],
    [{ totalCourses }],
    [{ certificatesIssued }],
  ] = await Promise.all([
    db.select({ totalUsers: sql<number>`CAST(COUNT(*) AS INT)` }).from(users),
    db
      .select({ activeUsers: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(users)
      .where(gte(users.lastActiveAt, since)),
    db
      .select({ newUsers: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(users)
      .where(gte(users.createdAt, since)),
    db
      .select({
        activeLearners: sql<number>`CAST(COUNT(DISTINCT ${userCourseProgress.userId}) AS INT)`,
      })
      .from(userCourseProgress)
      .where(gte(userCourseProgress.updatedAt, since)),
    db
      .select({
        enrolledLearners: sql<number>`CAST(COUNT(DISTINCT ${courseEnrollments.userId}) AS INT)`,
      })
      .from(courseEnrollments)
      .where(eq(courseEnrollments.status, "active")),
    db
      .select({ totalCourses: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(courses)
      .where(eq(courses.status, "published")),
    db
      .select({ certificatesIssued: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(courseCertificates)
      .where(eq(courseCertificates.status, "active")),
  ]);

  return {
    totalUsers,
    activeUsers,
    newUsers,
    activeLearners,
    enrolledLearners,
    totalCourses,
    certificatesIssued,
  };
}

// ---------------------------------------------------------------------------
// Legacy KPI stats (unchanged — used by Overview dashboard)
// ---------------------------------------------------------------------------

export interface KpiStats {
  totalUsers: number;
  activeCourses: number;
  certificatesIssued: number;
  activeLearnersThisMonth: number;
}

/**
 * Returns the four headline KPI counts shown on the admin Overview page.
 * - totalUsers: all registered users
 * - activeCourses: published courses only
 * - certificatesIssued: active (non-revoked) certificates
 * - activeLearnersThisMonth: distinct users with any course progress update this calendar month
 */
export async function getKpiStats(): Promise<KpiStats> {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    [{ totalUsers }],
    [{ activeCourses }],
    [{ certificatesIssued }],
    [{ activeLearnersThisMonth }],
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(users),
    db
      .select({ activeCourses: count() })
      .from(courses)
      .where(eq(courses.status, "published")),
    db
      .select({ certificatesIssued: count() })
      .from(courseCertificates)
      .where(eq(courseCertificates.status, "active")),
    db
      .select({
        activeLearnersThisMonth: sql<number>`CAST(COUNT(DISTINCT ${userCourseProgress.userId}) AS INT)`,
      })
      .from(userCourseProgress)
      .where(gte(userCourseProgress.updatedAt, startOfThisMonth)),
  ]);

  return { totalUsers, activeCourses, certificatesIssued, activeLearnersThisMonth };
}

export interface TrendPoint {
  label: string;
  count: number;
}

/**
 * Returns new-user registration counts bucketed by day or month depending on range.
 * - "7d" / "30d" → daily buckets, labels like "20 May"
 * - "12m"         → monthly buckets, labels like "May '25" (default, backward-compatible)
 * Each point has a short label and a numeric count.
 */
export async function getUserGrowthTrend(range: AnalyticsRange = "12m"): Promise<TrendPoint[]> {
  const since = rangeToStartDate(range);
  const isMonthly = range === "12m";

  // DATE_TRUNC requires the unit as a SQL string literal — parameterized values
  // ($1) are rejected by PostgreSQL for this argument position. Use two separate
  // sql fragments so the unit is always inlined as a literal.
  const labelExpr = isMonthly
    ? sql<string>`TO_CHAR(DATE_TRUNC('month', ${users.createdAt}), 'Mon ''YY')`
    : sql<string>`TO_CHAR(DATE_TRUNC('day', ${users.createdAt}), 'DD Mon')`;
  const bucketExpr = isMonthly
    ? sql<string>`DATE_TRUNC('month', ${users.createdAt})`
    : sql<string>`DATE_TRUNC('day', ${users.createdAt})`;

  const rows = await db
    .select({
      label: labelExpr,
      bucket: bucketExpr,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
    .from(users)
    .where(gte(users.createdAt, since))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  return rows.map((r) => ({ label: r.label, count: r.count }));
}

/**
 * Returns monthly new course-enrollment counts for the last 12 months.
 * Each point has a short label like "Jan '25" and a numeric count.
 */
export async function getEnrollmentTrend(): Promise<TrendPoint[]> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const rows = await db
    .select({
      label: sql<string>`TO_CHAR(DATE_TRUNC('month', ${courseEnrollments.enrolledAt}), 'Mon ''YY')`,
      monthStart: sql<string>`DATE_TRUNC('month', ${courseEnrollments.enrolledAt})`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
    .from(courseEnrollments)
    .where(gte(courseEnrollments.enrolledAt, twelveMonthsAgo))
    .groupBy(sql`DATE_TRUNC('month', ${courseEnrollments.enrolledAt})`)
    .orderBy(sql`DATE_TRUNC('month', ${courseEnrollments.enrolledAt})`);

  return rows.map((r) => ({ label: r.label, count: r.count }));
}

export interface CourseEngagementRow {
  courseId: string;
  label: string;
  activeLearners: number;
}

/**
 * Returns active-learner counts per published course for the current calendar month.
 * "Active" means at least one userCourseProgress update this month.
 * Limited to top 8 courses ordered by active learner count descending.
 * Labels are truncated to 18 chars to fit chart axes.
 */
export async function getCourseEngagement(): Promise<CourseEngagementRow[]> {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const rows = await db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      activeLearners: sql<number>`CAST(COUNT(DISTINCT ${userCourseProgress.userId}) AS INT)`,
    })
    .from(courses)
    .leftJoin(
      userCourseProgress,
      and(
        eq(userCourseProgress.courseId, courses.id),
        gte(userCourseProgress.updatedAt, startOfThisMonth),
      ),
    )
    .where(eq(courses.status, "published"))
    .groupBy(courses.id, courses.title)
    .orderBy(sql`COUNT(DISTINCT ${userCourseProgress.userId}) DESC`)
    .limit(8);

  return rows.map((r) => ({
    courseId: r.courseId,
    label:
      r.courseTitle.length > 18
        ? r.courseTitle.slice(0, 18) + "…"
        : r.courseTitle,
    activeLearners: r.activeLearners,
  }));
}

export interface CourseCompletionRow {
  courseId: string;
  label: string;
  totalEnrolled: number;
  completed: number;
  completionRate: number;
}

/**
 * Returns completion rate data per published course (must have at least one enrollment).
 * The `completed` count is scoped to enrollments completed within the given range,
 * while `totalEnrolled` reflects all-time enrollments per course.
 * Limited to top 8 by total enrollment count descending.
 * Labels are truncated to 22 chars to fit chart axes.
 * Defaults to "12m" for backward compatibility with Overview dashboard calls.
 */
export async function getCourseCompletionRates(range: AnalyticsRange = "12m"): Promise<CourseCompletionRow[]> {
  const since = rangeToStartDate(range);

  const rows = await db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      totalEnrolled: sql<number>`CAST(COUNT(${courseEnrollments.id}) AS INT)`,
      completed: sql<number>`CAST(COUNT(CASE WHEN ${courseEnrollments.status} = 'completed' AND ${courseEnrollments.completedAt} >= ${since} THEN 1 END) AS INT)`,
    })
    .from(courses)
    .innerJoin(courseEnrollments, eq(courseEnrollments.courseId, courses.id))
    .where(eq(courses.status, "published"))
    .groupBy(courses.id, courses.title)
    .orderBy(sql`COUNT(${courseEnrollments.id}) DESC`)
    .limit(8);

  return rows.map((r) => ({
    courseId: r.courseId,
    label:
      r.courseTitle.length > 22
        ? r.courseTitle.slice(0, 22) + "…"
        : r.courseTitle,
    totalEnrolled: r.totalEnrolled,
    completed: r.completed,
    completionRate:
      r.totalEnrolled > 0
        ? Math.round((r.completed / r.totalEnrolled) * 100)
        : 0,
  }));
}

// ---------------------------------------------------------------------------
// Course performance table (Task 6)
// ---------------------------------------------------------------------------

export interface CoursePerformanceRow {
  courseId: string;
  title: string;
  enrolled: number;
  completionRate: number;
  certificates: number;
}

/**
 * Returns a per-course performance summary for all published courses.
 * Joins enrollments and certificates to compute:
 * - enrolled: distinct learners who enrolled
 * - completionRate: percentage of enrolled learners who completed
 * - certificates: count of distinct certificates issued
 * Ordered by enrolled count descending.
 */
export async function getCoursePerformance(): Promise<CoursePerformanceRow[]> {
  const rows = await db
    .select({
      courseId: courses.id,
      title: courses.title,
      enrolled: sql<number>`CAST(COUNT(DISTINCT ${courseEnrollments.userId}) AS INT)`,
      completed: sql<number>`CAST(COUNT(DISTINCT CASE WHEN ${courseEnrollments.status} = 'completed' THEN ${courseEnrollments.userId} END) AS INT)`,
      certificates: sql<number>`CAST(COUNT(DISTINCT ${courseCertificates.id}) AS INT)`,
    })
    .from(courses)
    .leftJoin(courseEnrollments, eq(courseEnrollments.courseId, courses.id))
    .leftJoin(courseCertificates, eq(courseCertificates.courseId, courses.id))
    .where(eq(courses.status, "published"))
    .groupBy(courses.id, courses.title)
    .orderBy(sql`COUNT(DISTINCT ${courseEnrollments.userId}) DESC`);

  return rows.map((r) => ({
    courseId: r.courseId,
    title: r.title,
    enrolled: r.enrolled,
    completionRate:
      r.enrolled > 0 ? Math.round((r.completed / r.enrolled) * 100) : 0,
    certificates: r.certificates,
  }));
}

// ---------------------------------------------------------------------------
// Stakeholder KPIs and trend (Task 7)
// ---------------------------------------------------------------------------

export interface StakeholderKpis {
  expert: number;
  vc: number;
  government: number;
  corporate: number;
  university: number;
  incubator: number;
  total: number;
}

/**
 * Returns stakeholder registration counts broken down by type,
 * plus a grand total. Any type not present in the DB defaults to 0.
 */
export async function getStakeholderKpis(): Promise<StakeholderKpis> {
  const [orgRows, expertRows] = await Promise.all([
    db
      .select({
        type: stakeholderRegistrations.type,
        count: sql<number>`CAST(COUNT(*) AS INT)`,
      })
      .from(stakeholderRegistrations)
      .groupBy(stakeholderRegistrations.type),
    db
      .select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(mentorRegistrations),
  ]);

  const byType: Record<string, number> = {};
  let total = 0;
  for (const row of orgRows) {
    byType[row.type] = row.count;
    total += row.count;
  }

  const expertCount = expertRows[0]?.count ?? 0;
  total += expertCount;

  return {
    expert: expertCount,
    vc: byType["vc"] ?? 0,
    government: byType["government"] ?? 0,
    corporate: byType["corporate"] ?? 0,
    university: byType["university"] ?? 0,
    incubator: byType["incubator"] ?? 0,
    total,
  };
}

/**
 * Returns stakeholder registration counts bucketed by day or month depending on range.
 * - "7d" / "30d" → daily buckets, labels like "20 May"
 * - "12m"         → monthly buckets, labels like "May '25"
 */
export async function getStakeholderTrend(range: AnalyticsRange): Promise<TrendPoint[]> {
  const since = rangeToStartDate(range);
  const isMonthly = range === "12m";

  // Same fix as getUserGrowthTrend: DATE_TRUNC unit must be a SQL literal,
  // not a bind parameter. Two fragments ensure the unit is always inlined.
  const labelExpr = isMonthly
    ? sql<string>`TO_CHAR(DATE_TRUNC('month', ${stakeholderRegistrations.createdAt}), 'Mon ''YY')`
    : sql<string>`TO_CHAR(DATE_TRUNC('day', ${stakeholderRegistrations.createdAt}), 'DD Mon')`;
  const bucketExpr = isMonthly
    ? sql<string>`DATE_TRUNC('month', ${stakeholderRegistrations.createdAt})`
    : sql<string>`DATE_TRUNC('day', ${stakeholderRegistrations.createdAt})`;

  const rows = await db
    .select({
      label: labelExpr,
      bucket: bucketExpr,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
    .from(stakeholderRegistrations)
    .where(gte(stakeholderRegistrations.createdAt, since))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  return rows.map((r) => ({ label: r.label, count: r.count }));
}

export interface StakeholderTrendByTypePoint {
  label: string;
  expert: number;
  vc: number;
  government: number;
  corporate: number;
  university: number;
  incubator: number;
}

/**
 * Returns stakeholder registration counts bucketed by time period AND type.
 * Each point has a label plus one count per stakeholder type.
 * Used to render a multi-line chart — one line per type.
 */
export async function getStakeholderTrendByType(range: AnalyticsRange): Promise<StakeholderTrendByTypePoint[]> {
  const since = rangeToStartDate(range);
  const isMonthly = range === "12m";

  const orgLabelExpr = isMonthly
    ? sql<string>`TO_CHAR(DATE_TRUNC('month', ${stakeholderRegistrations.createdAt}), 'Mon ''YY')`
    : sql<string>`TO_CHAR(DATE_TRUNC('day', ${stakeholderRegistrations.createdAt}), 'DD Mon')`;
  const orgBucketExpr = isMonthly
    ? sql<string>`DATE_TRUNC('month', ${stakeholderRegistrations.createdAt})`
    : sql<string>`DATE_TRUNC('day', ${stakeholderRegistrations.createdAt})`;

  const expertLabelExpr = isMonthly
    ? sql<string>`TO_CHAR(DATE_TRUNC('month', ${mentorRegistrations.createdAt}), 'Mon ''YY')`
    : sql<string>`TO_CHAR(DATE_TRUNC('day', ${mentorRegistrations.createdAt}), 'DD Mon')`;
  const expertBucketExpr = isMonthly
    ? sql<string>`DATE_TRUNC('month', ${mentorRegistrations.createdAt})`
    : sql<string>`DATE_TRUNC('day', ${mentorRegistrations.createdAt})`;

  const [orgRows, expertRows] = await Promise.all([
    db
      .select({
        label: orgLabelExpr,
        bucket: orgBucketExpr,
        type: stakeholderRegistrations.type,
        count: sql<number>`CAST(COUNT(*) AS INT)`,
      })
      .from(stakeholderRegistrations)
      .where(gte(stakeholderRegistrations.createdAt, since))
      .groupBy(orgBucketExpr, stakeholderRegistrations.type)
      .orderBy(orgBucketExpr),
    db
      .select({
        label: expertLabelExpr,
        bucket: expertBucketExpr,
        count: sql<number>`CAST(COUNT(*) AS INT)`,
      })
      .from(mentorRegistrations)
      .where(gte(mentorRegistrations.createdAt, since))
      .groupBy(expertBucketExpr)
      .orderBy(expertBucketExpr),
  ]);

  // Pivot: one object per bucket, types spread as columns
  const bucketMap = new Map<string, StakeholderTrendByTypePoint>();
  for (const row of orgRows) {
    if (!bucketMap.has(row.label)) {
      bucketMap.set(row.label, { label: row.label, expert: 0, vc: 0, government: 0, corporate: 0, university: 0, incubator: 0 });
    }
    const point = bucketMap.get(row.label)!;
    const t = row.type as keyof Omit<StakeholderTrendByTypePoint, "label">;
    if (t in point) point[t] = row.count;
  }

  for (const row of expertRows) {
    if (!bucketMap.has(row.label)) {
      bucketMap.set(row.label, { label: row.label, expert: 0, vc: 0, government: 0, corporate: 0, university: 0, incubator: 0 });
    }
    bucketMap.get(row.label)!.expert = row.count;
  }

  // Sort chronologically (merging two ordered sets can interleave buckets)
  return Array.from(bucketMap.values()).sort((a, b) => a.label.localeCompare(b.label));
}
