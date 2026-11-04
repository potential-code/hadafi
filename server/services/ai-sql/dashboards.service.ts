/**
 * AI Dashboard — saved boards (ported from SMEEP, which took it from VX Academy).
 *
 * Persistence holds chart SPECS ONLY — a SELECT and how its columns map onto a
 * picture, never result rows. Every render re-runs the SELECT through
 * POST /api/admin/ai/query (the guarded, read-only path). Boards are shared
 * across all admins: `createdBy` is audit metadata, reads are never filtered
 * by it.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { aiDashboards } from "../../db/schema";
import { parseSqlChartSpec, type SqlChartSpec } from "./chart-spec";

export interface DashboardRecord {
  id: string;
  title: string;
  charts: SqlChartSpec[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Keep the charts that still parse and drop the rest: `charts` is a bare
 * jsonb column, and a board saved under an older spec shape must degrade to
 * fewer charts rather than make the page unopenable.
 */
function readCharts(value: unknown): SqlChartSpec[] {
  if (!Array.isArray(value)) return [];
  const kept: SqlChartSpec[] = [];
  for (const entry of value) {
    const spec = parseSqlChartSpec(entry);
    if (spec) kept.push(spec);
  }
  return kept;
}

function toRecord(row: typeof aiDashboards.$inferSelect): DashboardRecord {
  return {
    id: row.id,
    title: row.title,
    charts: readCharts(row.charts),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id is "not found", not a Postgres cast error. */
export function isDashboardId(id: string): boolean {
  return UUID.test(id);
}

export async function listDashboards(): Promise<DashboardRecord[]> {
  const rows = await db.select().from(aiDashboards).orderBy(desc(aiDashboards.updatedAt));
  return rows.map(toRecord);
}

export async function getDashboard(id: string): Promise<DashboardRecord | null> {
  if (!isDashboardId(id)) return null;
  const [row] = await db.select().from(aiDashboards).where(eq(aiDashboards.id, id)).limit(1);
  return row ? toRecord(row) : null;
}

export async function createDashboard(input: {
  title: string;
  charts: SqlChartSpec[];
  createdBy: string | null;
}): Promise<DashboardRecord> {
  const [row] = await db
    .insert(aiDashboards)
    .values({ title: input.title, charts: input.charts, createdBy: input.createdBy })
    .returning();
  return toRecord(row!);
}

export async function updateDashboard(
  id: string,
  input: { title: string; charts: SqlChartSpec[] },
): Promise<DashboardRecord | null> {
  if (!isDashboardId(id)) return null;
  const [row] = await db
    .update(aiDashboards)
    .set({ title: input.title, charts: input.charts, updatedAt: new Date() })
    .where(eq(aiDashboards.id, id))
    .returning();
  return row ? toRecord(row) : null;
}

export async function deleteDashboard(id: string): Promise<boolean> {
  if (!isDashboardId(id)) return false;
  const [row] = await db.delete(aiDashboards).where(eq(aiDashboards.id, id)).returning({ id: aiDashboards.id });
  return Boolean(row);
}
