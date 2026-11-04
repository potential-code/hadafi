import crypto from "crypto";
import { and, asc, desc, eq, gte, inArray, like, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { aiReportNotes, aiReports, users, type AiReportTurn } from "../db/schema";
import { AppError } from "../utils/app-error";
import { notify } from "./notifications.service";

/**
 * AI safety review (ported from SMEEP): a learner reports an AI answer
 * (wrong, harmful, inappropriate…) from her own chat with Hana or an AI
 * mentor, and admins review it, add notes and record what they did. Every
 * admin hears about a new report in the bell. The reported text is stored and
 * shown as plain text, never rendered as HTML or markdown.
 */

export const REPORT_REASONS = ["wrong", "harmful", "inappropriate", "unhelpful", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_STATUSES = ["new", "reviewed", "action_taken"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REASON_LABEL: Record<ReportReason, string> = {
  wrong: "Wrong or misleading",
  harmful: "Harmful or unsafe",
  inappropriate: "Inappropriate",
  unhelpful: "Not helpful",
  other: "Something else",
};

/** Which AI features a learner can report from (the area filter on the admin page). */
export type SurfaceArea = "hana" | "mentor" | "examiner";

export function surfaceArea(surface: string): SurfaceArea | "other" {
  if (surface === "ask-hana" || surface.startsWith("hana") || surface === "course-help" || surface === "multi-learning") return "hana";
  if (surface.startsWith("mentor:")) return "mentor";
  if (surface === "examiner") return "examiner";
  return "other";
}

/** "mentor:marketing-coach" → "AI mentor (marketing coach)". */
export function surfaceLabel(surface: string): string {
  const named: Record<string, string> = {
    "ask-hana": "Ask Hana",
    "course-help": "Hana, course helper",
    "multi-learning": "Multi Learning tutor",
    examiner: "AI Examiner",
  };
  if (named[surface]) return named[surface]!;
  if (surface.startsWith("mentor:")) return `AI mentor (${surface.slice(7).replace(/-/g, " ")})`;
  return surface;
}

export interface NewReport {
  surface: string;
  reason: ReportReason;
  note?: string | null;
  reply: string;
  question?: string | null;
  excerpt?: AiReportTurn[] | null;
  /** The chat's own id in the browser (Ask Hana thread, mentor chat session). */
  conversation?: string | null;
  page?: string | null;
}

const clip = (s: string | null | undefined, n: number) => {
  const t = s?.trim();
  return t ? t.slice(0, n) : null;
};

/**
 * Saves a learner's report. The reporter is always the signed-in learner,
 * and the conversation reference is scoped to her on the server (her user id
 * is part of it), so a report can only ever point at her own chat. Reporting
 * the same answer twice returns the first report.
 */
export async function createReport(userId: string, input: NewReport): Promise<{ id: string; duplicate: boolean }> {
  const reply = input.reply.trim().slice(0, 12_000);
  if (!reply) throw new AppError("There is no answer to report.", 422, "VALIDATION_ERROR");
  const replyHash = crypto.createHash("sha256").update(`${input.surface}\n${reply}`).digest("hex");
  // Mentor chats are stored upstream as "hadafi-<userId>-<session>"; Ask Hana threads live in the browser.
  const conversationRef = input.conversation
    ? input.surface.startsWith("mentor:")
      ? `hadafi-${userId}-${input.conversation}`
      : `${userId}:${input.conversation}`
    : null;
  const excerpt = (input.excerpt ?? [])
    .slice(-6)
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, 2_000) }))
    .filter((t) => t.text);

  const [row] = await db
    .insert(aiReports)
    .values({
      userId,
      surface: input.surface,
      reason: input.reason,
      note: clip(input.note, 1_000),
      reply,
      replyHash,
      question: clip(input.question, 4_000),
      excerpt,
      conversationRef,
      page: clip(input.page, 300),
    })
    .onConflictDoNothing()
    .returning({ id: aiReports.id });
  if (!row) {
    const [existing] = await db
      .select({ id: aiReports.id })
      .from(aiReports)
      .where(and(eq(aiReports.userId, userId), eq(aiReports.replyHash, replyHash)));
    return { id: existing!.id, duplicate: true };
  }

  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  // Awaited so the report and its alert land together (notify never throws).
  await notify(
    admins.map((a) => a.id),
    {
      type: "ai_report",
      title: `AI answer reported: ${REASON_LABEL[input.reason]}`,
      body: `${surfaceLabel(input.surface)}. Review it on AI safety review.`,
      link: "/admin/ai-safety",
      dedupeKey: `ai_report:${row.id}`,
    },
  );
  return { id: row.id, duplicate: false };
}

export interface ReportFilter {
  status: ReportStatus | "all";
  area: SurfaceArea | "all";
}

function areaWhere(area: ReportFilter["area"]) {
  if (area === "hana") return sql`(${aiReports.surface} = 'ask-hana' OR ${aiReports.surface} LIKE 'hana%' OR ${aiReports.surface} IN ('course-help', 'multi-learning'))`;
  if (area === "mentor") return like(aiReports.surface, "mentor:%");
  if (area === "examiner") return eq(aiReports.surface, "examiner");
  return undefined;
}

export async function listReports(filter: ReportFilter) {
  const reviewer = alias(users, "reviewer");
  const where = and(filter.status === "all" ? undefined : eq(aiReports.status, filter.status), areaWhere(filter.area));
  const rows = await db
    .select({
      report: aiReports,
      reporterName: users.fullName,
      reporterEmail: users.email,
      reviewerName: reviewer.fullName,
    })
    .from(aiReports)
    .leftJoin(users, eq(users.id, aiReports.userId))
    .leftJoin(reviewer, eq(reviewer.id, aiReports.reviewedBy))
    .where(where)
    .orderBy(desc(aiReports.createdAt))
    .limit(200);

  const ids = rows.map((r) => r.report.id);
  const notes = ids.length
    ? await db
        .select({ id: aiReportNotes.id, reportId: aiReportNotes.reportId, text: aiReportNotes.text, createdAt: aiReportNotes.createdAt, by: users.fullName })
        .from(aiReportNotes)
        .leftJoin(users, eq(users.id, aiReportNotes.adminId))
        .where(inArray(aiReportNotes.reportId, ids))
        .orderBy(asc(aiReportNotes.createdAt))
    : [];

  // Counts per status for the filter chips and figures (within the area filter).
  const counts = await db
    .select({ status: aiReports.status, n: sql<number>`count(*)::int` })
    .from(aiReports)
    .where(areaWhere(filter.area))
    .groupBy(aiReports.status);
  const [month] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiReports)
    .where(gte(aiReports.createdAt, new Date(Date.now() - 30 * 86_400_000)));

  return {
    counts: Object.fromEntries(REPORT_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0])) as Record<ReportStatus, number>,
    last30Days: month?.n ?? 0,
    reports: rows.map((r) => ({
      id: r.report.id,
      surface: r.report.surface,
      surfaceLabel: surfaceLabel(r.report.surface),
      area: surfaceArea(r.report.surface),
      reason: r.report.reason,
      reasonLabel: REASON_LABEL[r.report.reason as ReportReason] ?? r.report.reason,
      note: r.report.note,
      reply: r.report.reply,
      question: r.report.question,
      excerpt: r.report.excerpt,
      page: r.report.page,
      status: r.report.status as ReportStatus,
      createdAt: r.report.createdAt.toISOString(),
      reviewedAt: r.report.reviewedAt?.toISOString() ?? null,
      reporterName: r.reporterName,
      reporterEmail: r.reporterEmail,
      reviewerName: r.reviewerName,
      notes: notes
        .filter((n) => n.reportId === r.report.id)
        .map((n) => ({ id: n.id, text: n.text, by: n.by, createdAt: n.createdAt.toISOString() })),
    })),
  };
}

export async function setReportStatus(adminId: string, id: string, status: ReportStatus): Promise<{ ok: true }> {
  const rows = await db
    .update(aiReports)
    .set({
      status,
      reviewedBy: status === "new" ? null : adminId,
      reviewedAt: status === "new" ? null : new Date(),
    })
    .where(eq(aiReports.id, id))
    .returning({ id: aiReports.id });
  if (!rows.length) throw new AppError("Report not found", 404, "NOT_FOUND");
  return { ok: true };
}

export async function addReportNote(adminId: string, id: string, text: string) {
  const [report] = await db.select({ id: aiReports.id }).from(aiReports).where(eq(aiReports.id, id));
  if (!report) throw new AppError("Report not found", 404, "NOT_FOUND");
  const [row] = await db.insert(aiReportNotes).values({ reportId: id, adminId, text: text.trim() }).returning();
  return { id: row!.id, text: row!.text, createdAt: row!.createdAt.toISOString() };
}
