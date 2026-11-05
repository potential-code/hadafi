import { sql } from "drizzle-orm";
import writeXlsxFile, { type Cell as XlsxCell } from "write-excel-file/node";
import { db } from "../db";
import { listLearningGain, orgOf, type LearnerScope } from "./admin.learningGain.service";
import { countryLabel } from "./admin.impact.service";
import { autoFilter, BRAND_HEX } from "./xlsx";

/**
 * Admin exports: the platform's records as CSV or Excel, for reporting to
 * sponsors. Each dataset is a list of named columns and one row per record.
 * Read-only; admins only (see the route). Ported from SMEEP's
 * admin.exports.service.ts (205bf7a), without the journey and AI Examiner
 * columns Hadafi doesn't have.
 */

export const EXPORT_DATASETS = ["learners", "course-progress", "learning-gain", "certificates", "redemptions", "mentor-sessions", "newsletter"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];
export type ExportFormat = "csv" | "xlsx";

export const isExportDataset = (v: string): v is ExportDataset => (EXPORT_DATASETS as readonly string[]).includes(v);

export type Cell = string | number | Date | null;
export interface Table {
  title: string;
  /** `time`: a date and time (UAE time) rather than just a date. */
  columns: { key: string; label: string; width?: number; time?: boolean }[];
  rows: Record<string, Cell>[];
}

const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, unknown>[];
const date = (v: unknown): Date | null => (v ? (v instanceof Date ? v : new Date(String(v))) : null);
const int = (v: unknown): number | null => (v == null ? null : Number(v));
const text = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const country = (v: unknown): string | null => (v == null || String(v).trim() === "" ? null : countryLabel(String(v)));

async function learners(scope: LearnerScope): Promise<Table> {
  const data = await rows(sql`
    SELECT u.full_name, u.email, u.company, u.country, u.points, u.created_at, u.last_active_at,
      (SELECT count(*) FROM course_enrollments e WHERE e.user_id = u.id) AS courses_started,
      (SELECT count(*) FROM user_course_progress p WHERE p.user_id = u.id AND p.completed_at IS NOT NULL) AS courses_completed,
      (SELECT count(*) FROM user_learning_block_progress b WHERE b.user_id = u.id AND b.status = 'completed') AS lessons_completed,
      (SELECT count(*) FROM course_certificates c WHERE c.user_id = u.id AND c.status = 'active') AS certificates,
      (SELECT count(*) FROM mentor_sessions s WHERE s.sme_user_id = u.id AND s.status <> 'cancelled') AS mentor_sessions,
      (SELECT count(*) FROM offer_redemptions r WHERE r.user_id = u.id) AS offers_redeemed
    FROM users u WHERE u.role = 'sme' ${orgOf("u", scope)} ORDER BY u.created_at DESC
  `);
  return {
    title: "Learners",
    columns: [
      { key: "name", label: "Name", width: 26 },
      { key: "email", label: "Email", width: 32 },
      { key: "company", label: "Company", width: 24 },
      { key: "country", label: "Country", width: 18 },
      { key: "joined", label: "Joined", width: 14 },
      { key: "lastActive", label: "Last active", width: 14 },
      { key: "coursesStarted", label: "Courses started" },
      { key: "coursesCompleted", label: "Courses completed" },
      { key: "lessonsCompleted", label: "Lessons completed" },
      { key: "certificates", label: "Certificates" },
      { key: "mentorSessions", label: "Mentor sessions" },
      { key: "points", label: "Points" },
      { key: "offersRedeemed", label: "Offers redeemed" },
    ],
    rows: data.map((r) => ({
      name: text(r.full_name),
      email: text(r.email),
      company: text(r.company),
      country: country(r.country),
      joined: date(r.created_at),
      lastActive: date(r.last_active_at),
      coursesStarted: int(r.courses_started),
      coursesCompleted: int(r.courses_completed),
      lessonsCompleted: int(r.lessons_completed),
      certificates: int(r.certificates),
      mentorSessions: int(r.mentor_sessions),
      points: int(r.points),
      offersRedeemed: int(r.offers_redeemed),
    })),
  };
}

async function courseProgress(scope: LearnerScope): Promise<Table> {
  const data = await rows(sql`
    WITH best AS (
      SELECT aa.user_id, s.course_id, s.assessment_type,
             (array_agg(aa.score ORDER BY aa.completed_at ASC))[1] AS first_score,
             max(aa.score) AS best_score
      FROM assessment_attempts aa JOIN assessments s ON s.id = aa.assessment_id
      WHERE aa.completed_at IS NOT NULL AND aa.score IS NOT NULL
      GROUP BY aa.user_id, s.course_id, s.assessment_type
    )
    SELECT u.full_name, u.email, c.title, e.enrolled_at,
           coalesce(p.progress_percentage, 0) AS progress, p.completed_at,
           pre.first_score AS pre_score, post.best_score AS final_score,
           cert.certificate_number
    FROM course_enrollments e
    JOIN users u ON u.id = e.user_id AND u.role = 'sme' ${orgOf("u", scope)}
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN user_course_progress p ON p.user_id = e.user_id AND p.course_id = e.course_id
    LEFT JOIN best pre ON pre.user_id = e.user_id AND pre.course_id = e.course_id AND pre.assessment_type = 'pre'
    LEFT JOIN best post ON post.user_id = e.user_id AND post.course_id = e.course_id AND post.assessment_type = 'post'
    LEFT JOIN course_certificates cert ON cert.user_id = e.user_id AND cert.course_id = e.course_id AND cert.status = 'active'
    ORDER BY u.full_name, c.title
  `);
  return {
    title: "Course progress",
    columns: [
      { key: "name", label: "Learner", width: 26 },
      { key: "email", label: "Email", width: 32 },
      { key: "course", label: "Course", width: 36 },
      { key: "started", label: "Started", width: 14 },
      { key: "progress", label: "Progress %" },
      { key: "completed", label: "Completed", width: 14 },
      { key: "pre", label: "Pre-test %" },
      { key: "final", label: "Final exam % (best)" },
      { key: "gain", label: "Gain (points)" },
      { key: "certificate", label: "Certificate no.", width: 20 },
    ],
    rows: data.map((r) => ({
      name: text(r.full_name),
      email: text(r.email),
      course: text(r.title),
      started: date(r.enrolled_at),
      progress: int(r.progress),
      completed: date(r.completed_at),
      pre: int(r.pre_score),
      final: int(r.final_score),
      gain: r.pre_score != null && r.final_score != null ? Number(r.final_score) - Number(r.pre_score) : null,
      certificate: text(r.certificate_number),
    })),
  };
}

async function learningGain(scope: LearnerScope): Promise<Table> {
  const data = await listLearningGain(scope);
  return {
    title: "Learning gain",
    columns: [
      { key: "name", label: "Learner", width: 26 },
      { key: "email", label: "Email", width: 32 },
      { key: "course", label: "Course", width: 36 },
      { key: "pre", label: "Pre-test %" },
      { key: "final", label: "Final exam % (best)" },
      { key: "gain", label: "Gain (points)" },
      { key: "preAt", label: "Pre-test taken", width: 14 },
      { key: "finalAt", label: "Final exam taken", width: 14 },
    ],
    rows: data.map((r) => ({
      name: r.learner,
      email: r.email,
      course: r.course,
      pre: r.preScore,
      final: r.postScore,
      gain: r.gain,
      preAt: new Date(r.preAt),
      finalAt: new Date(r.postAt),
    })),
  };
}

async function certificates(scope: LearnerScope): Promise<Table> {
  const data = await rows(sql`
    SELECT u.full_name, u.email, u.country, c.title, cert.certificate_number, cert.issued_at, cert.status
    FROM course_certificates cert
    JOIN users u ON u.id = cert.user_id ${orgOf("u", scope)}
    JOIN courses c ON c.id = cert.course_id
    ORDER BY cert.issued_at DESC
  `);
  return {
    title: "Certificates",
    columns: [
      { key: "name", label: "Learner", width: 26 },
      { key: "email", label: "Email", width: 32 },
      { key: "country", label: "Country", width: 18 },
      { key: "course", label: "Course", width: 36 },
      { key: "number", label: "Certificate no.", width: 20 },
      { key: "issued", label: "Issued", width: 14 },
      { key: "status", label: "Status" },
    ],
    rows: data.map((r) => ({
      name: text(r.full_name),
      email: text(r.email),
      country: country(r.country),
      course: text(r.title),
      number: text(r.certificate_number),
      issued: date(r.issued_at),
      status: text(r.status),
    })),
  };
}

async function redemptions(scope: LearnerScope): Promise<Table> {
  const data = await rows(sql`
    SELECT u.full_name, u.email, o.title, r.points_deducted, r.amount_charged, r.order_status, r.redeemed_at
    FROM offer_redemptions r
    JOIN users u ON u.id = r.user_id ${orgOf("u", scope)}
    JOIN offers o ON o.id = r.offer_id
    ORDER BY r.redeemed_at DESC
  `);
  return {
    title: "Offer redemptions",
    columns: [
      { key: "name", label: "Learner", width: 26 },
      { key: "email", label: "Email", width: 32 },
      { key: "offer", label: "Offer", width: 36 },
      { key: "points", label: "Points used" },
      { key: "amount", label: "Amount paid (USD)" },
      { key: "status", label: "Order" },
      { key: "date", label: "Redeemed", width: 14 },
    ],
    rows: data.map((r) => ({
      name: text(r.full_name),
      email: text(r.email),
      offer: text(r.title),
      points: int(r.points_deducted),
      amount: r.amount_charged == null ? null : Number(r.amount_charged) / 100,
      status: text(r.order_status),
      date: date(r.redeemed_at),
    })),
  };
}

async function mentorSessions(scope: LearnerScope): Promise<Table> {
  const data = await rows(sql`
    SELECT sme.full_name AS learner, sme.email AS learner_email, m.full_name AS mentor,
           slot.starts_at, slot.ends_at, s.status, s.booked_at, s.cancelled_by
    FROM mentor_sessions s
    JOIN users sme ON sme.id = s.sme_user_id ${orgOf("sme", scope)}
    JOIN users m ON m.id = s.mentor_user_id
    LEFT JOIN mentor_availability_slots slot ON slot.id = s.slot_id
    ORDER BY slot.starts_at DESC NULLS LAST
  `);
  return {
    title: "Mentor sessions",
    columns: [
      { key: "learner", label: "Learner", width: 26 },
      { key: "email", label: "Learner email", width: 32 },
      { key: "mentor", label: "Mentor", width: 26 },
      { key: "starts", label: "Starts (UAE time)", width: 20, time: true },
      { key: "minutes", label: "Minutes" },
      { key: "status", label: "Status" },
      { key: "cancelledBy", label: "Cancelled by" },
      { key: "booked", label: "Booked", width: 14 },
    ],
    rows: data.map((r) => {
      const starts = date(r.starts_at);
      const ends = date(r.ends_at);
      return {
        learner: text(r.learner),
        email: text(r.learner_email),
        mentor: text(r.mentor),
        starts,
        minutes: starts && ends ? Math.round((+ends - +starts) / 60000) : null,
        status: text(r.status),
        cancelledBy: text(r.cancelled_by),
        booked: date(r.booked_at),
      };
    }),
  };
}

/** Homepage newsletter sign-ups. Platform-wide only: an organisation's export never includes it. */
async function newsletter(scope: LearnerScope): Promise<Table> {
  const data = scope.organisationId
    ? []
    : await rows(sql`
        SELECT email, source, created_at, unsubscribed_at FROM newsletter_subscribers ORDER BY created_at DESC
      `);
  return {
    title: "Newsletter subscribers",
    columns: [
      { key: "email", label: "Email", width: 34 },
      { key: "status", label: "Status" },
      { key: "source", label: "Signed up on" },
      { key: "date", label: "Signed up", width: 14 },
      { key: "left", label: "Unsubscribed", width: 14 },
    ],
    rows: data.map((r) => ({
      email: text(r.email),
      status: r.unsubscribed_at ? "Unsubscribed" : "Subscribed",
      source: text(r.source),
      date: date(r.created_at),
      left: r.unsubscribed_at ? date(r.unsubscribed_at) : null,
    })),
  };
}

const BUILDERS: Record<ExportDataset, (scope: LearnerScope) => Promise<Table>> = {
  learners,
  "course-progress": courseProgress,
  "learning-gain": learningGain,
  certificates,
  redemptions,
  "mentor-sessions": mentorSessions,
  newsletter,
};

// ── Writers ──────────────────────────────────────────────────────────────────

/** A cell a spreadsheet could run as a formula is prefixed so it stays text. */
export function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const UAE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
/** "2026-10-05 06:00" in UAE time. */
const uaeDateTime = (d: Date) => UAE.format(d).replace(", ", " ");

function csvCell(v: Cell, time = false): string {
  if (v == null) return "";
  const s = v instanceof Date ? (time ? uaeDateTime(v) : iso(v)) : typeof v === "number" ? String(v) : safeText(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(t: Table): Buffer {
  const lines = [t.columns.map((c) => csvCell(c.label)).join(",")];
  for (const r of t.rows) lines.push(t.columns.map((c) => csvCell(r[c.key] ?? null, c.time)).join(","));
  // BOM so Excel opens UTF-8 (Arabic names) correctly.
  return Buffer.from("﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

async function toXlsx(t: Table): Promise<Buffer> {
  const header: XlsxCell[] = t.columns.map((c) => ({
    value: c.label,
    fontWeight: "bold",
    textColor: "#FFFFFF",
    backgroundColor: BRAND_HEX,
    alignVertical: "center",
  }));
  const body: XlsxCell[][] = t.rows.map((r) =>
    t.columns.map((c): XlsxCell => {
      const v = r[c.key] ?? null;
      if (typeof v === "string") return safeText(v);
      if (v instanceof Date) return c.time ? uaeDateTime(v) : { value: v, type: Date, format: "yyyy-mm-dd" };
      return v;
    }),
  );
  return writeXlsxFile(
    [header, ...body],
    {
      sheet: t.title.slice(0, 31),
      columns: t.columns.map((c) => ({ width: c.width ?? Math.max(12, c.label.length + 2) })),
      stickyRowsCount: 1,
    },
    { features: t.rows.length ? [autoFilter(t.columns.length)] : [] },
  ).toBuffer();
}

export interface ExportFile {
  filename: string;
  contentType: string;
  body: Buffer;
  rows: number;
}

/** What a partner organisation's contacts can download about their own learners. */
export const ORGANISATION_DATASETS = ["learners", "course-progress", "learning-gain", "certificates", "mentor-sessions"] as const satisfies readonly ExportDataset[];

/**
 * One dataset as a file. With `scope.organisationId`, only that organisation's
 * learners (partner downloads); `filePrefix` names the file (default "hadafi").
 */
export async function buildExport(
  dataset: ExportDataset,
  format: ExportFormat,
  scope: LearnerScope & { filePrefix?: string } = {},
): Promise<ExportFile> {
  return writeTable(await BUILDERS[dataset](scope), format, `${scope.filePrefix ?? "hadafi"}-${dataset}`);
}

/** Any table as a CSV or Excel download, named `<name>-<date>`. */
export async function writeTable(table: Table, format: ExportFormat, baseName: string): Promise<ExportFile> {
  const name = `${baseName}-${iso(new Date())}`;
  if (format === "csv") {
    return { filename: `${name}.csv`, contentType: "text/csv; charset=utf-8", body: toCsv(table), rows: table.rows.length };
  }
  return {
    filename: `${name}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: await toXlsx(table),
    rows: table.rows.length,
  };
}
