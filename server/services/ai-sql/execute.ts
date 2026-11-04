/**
 * AI analytics: the query executor (ported from SMEEP / Sama's AI Insights).
 *
 * Runs one guard-approved query as the `hadafi_ai_readonly` role, inside an
 * explicitly READ ONLY transaction, with a statement timeout,
 * `search_path = ai` and a hard row cap.
 *
 * Every constraint here is duplicated somewhere else on purpose: the guard
 * rejects writes before a connection is touched, the transaction refuses them
 * if one slipped through, and the role has no rights to make them.
 */

import type pg from "pg";
import { checkReadonlyRoleSafety, getAiQueryPool } from "./readonly-pool";
import { AI_SCHEMA, AiSqlError, assertSafeSql } from "./guard";
import { AI_STATEMENT_TIMEOUT_MS, MAX_ROWS } from "./limits";

export type SqlValue = string | number | boolean | null;

export interface SqlExecuteResult {
  columns: string[];
  /**
   * Postgres type name per column, parallel to `columns` — `""` for a type the
   * map below does not name. Chart choosers read these: knowing a column is a
   * `date` rather than `text` is the difference between a line and a bar chart.
   */
  columnTypes: string[];
  rows: SqlValue[][];
  rowCount: number;
  /** True when the row cap clipped the result set. */
  truncated: boolean;
  elapsedMs: number;
}

/** Postgres type OID → type name, for the types the `ai` views return. */
const PG_TYPE_NAMES: Record<number, string> = {
  16: "boolean",
  19: "name",
  20: "bigint",
  21: "smallint",
  23: "integer",
  25: "text",
  114: "json",
  700: "real",
  701: "double precision",
  1009: "text[]",
  1042: "character",
  1043: "varchar",
  1082: "date",
  1083: "time",
  1114: "timestamp",
  1184: "timestamptz",
  1186: "interval",
  1700: "numeric",
  2950: "uuid",
  3802: "jsonb",
};

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/**
 * Type parsers for AI queries only, so the app's own pool keeps its defaults.
 * Dates and naive timestamps stay as text — a JS Date would shift a `date` by
 * the server's UTC offset — and bigint/numeric become numbers when exact
 * enough to chart (a count(*) is a bigint).
 */
const AI_TYPES = {
  getTypeParser(oid: number): (value: string) => unknown {
    switch (oid) {
      case 16:
        return (v) => v === "t";
      case 20:
        return (v) => {
          const n = Number(v);
          return Number.isSafeInteger(n) ? n : v;
        };
      case 21:
      case 23:
        return (v) => Number(v);
      case 700:
      case 701:
      case 1700:
        return (v) => (NUMERIC_TEXT.test(v) && Number.isFinite(Number(v)) ? Number(v) : v);
      case 1114:
        // "2026-10-02 09:30:00" → "2026-10-02T09:30:00" (naive; no zone is implied)
        return (v) => v.replace(" ", "T");
      case 1184:
        return (v) => {
          const d = new Date(v);
          return Number.isNaN(d.getTime()) ? v : d.toISOString();
        };
      default:
        return (v) => v;
    }
  },
};

function normaliseValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  return JSON.stringify(value);
}

/**
 * Wraps the agent's query so the row cap is applied by the database rather
 * than trusted to the model. One extra row is fetched so truncation can be
 * detected rather than guessed at.
 */
export function withRowCap(sql: string): string {
  return `SELECT * FROM (\n${sql.trim().replace(/;\s*$/, "")}\n) _ai_q LIMIT ${MAX_ROWS + 1}`;
}

/**
 * Postgres errors are far more useful to the model than a generic failure —
 * "column learner.email does not exist" is a correction it can act on.
 */
function describePgError(err: unknown, timeoutMs: number): string {
  const e = err as { message?: string; hint?: string; code?: string };
  if (e?.code === "57014") {
    return `The query took longer than ${timeoutMs / 1000} seconds and was cancelled. Try aggregating in SQL, or narrowing the date range.`;
  }
  const base = e?.message ?? "The query failed.";
  return e?.hint ? `${base} Hint: ${e.hint}` : base;
}

/** One guard-approved, row-capped statement, ready to run. */
export interface ReadOnlyQuery {
  /** Final SQL text, already guarded and wrapped by `withRowCap`. */
  text: string;
  /** Bind parameters ($1…). */
  params?: unknown[];
  /** `SET LOCAL search_path` value — a fixed identifier, never user input. */
  searchPath: string;
  /** Statement timeout; defaults to AI_STATEMENT_TIMEOUT_MS (tests lower it). */
  timeoutMs?: number;
}

/**
 * Runs one already-guarded statement as the read-only role, inside a READ
 * ONLY transaction with a statement timeout, and shapes the result.
 */
export async function runReadOnlyQuery(query: ReadOnlyQuery): Promise<SqlExecuteResult> {
  const timeoutMs = Math.max(1, Math.floor(query.timeoutMs ?? AI_STATEMENT_TIMEOUT_MS));
  const pool = getAiQueryPool();

  let safety;
  try {
    safety = await checkReadonlyRoleSafety(pool);
  } catch (err) {
    console.error("[ai-sql] could not check the read-only role:", (err as Error).message);
    throw new AiSqlError("The analytics database is unavailable. Try again in a moment.", 503, "AI_DB_UNAVAILABLE");
  }
  // Belt and braces against the role itself: a role ever provisioned with
  // more than SELECT on `ai` stops every query here.
  if (!safety.safe) {
    throw new AiSqlError(
      "The AI analytics database connection is misconfigured and has been disabled. Check server logs.",
      503,
      "AI_READONLY_ROLE_UNSAFE",
    );
  }

  const started = Date.now();
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error("[ai-sql] could not get a connection:", (err as Error).message);
    throw new AiSqlError("The analytics database is unavailable. Try again in a moment.", 503, "AI_DB_UNAVAILABLE");
  }

  let broken = false;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    // Unqualified names resolve only to this schema (pg_catalog is always
    // searched first, and the guard has already refused catalogue names).
    await client.query(`SET LOCAL search_path = ${query.searchPath}`);
    const result = await client.query({ text: query.text, values: query.params, rowMode: "array", types: AI_TYPES });
    await client.query("COMMIT");

    const columns = result.fields.map((f) => f.name);
    const columnTypes = result.fields.map((f) => PG_TYPE_NAMES[f.dataTypeID] ?? "");
    const allRows = result.rows as unknown[][];
    const truncated = allRows.length > MAX_ROWS;
    const kept = truncated ? allRows.slice(0, MAX_ROWS) : allRows;
    return {
      columns,
      columnTypes,
      rows: kept.map((row) => row.map(normaliseValue)),
      rowCount: kept.length,
      truncated,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      broken = true;
    });
    const message = describePgError(err, timeoutMs);
    throw new AiSqlError(message, 400, (err as { code?: string })?.code === "57014" ? "SQL_TIMEOUT" : "SQL_FAILED", [
      message,
    ]);
  } finally {
    // A connection whose transaction state is in doubt is discarded, not reused.
    client.release(broken ? true : undefined);
  }
}

/**
 * Validates and runs one query.
 *
 * @param sql          raw SQL from the agent
 * @param allowedViews the unqualified view names the agent may read
 */
export async function executeAiSql(sql: string, allowedViews: readonly string[]): Promise<SqlExecuteResult> {
  // Guard first, so a rejected query never touches a connection.
  assertSafeSql(sql, allowedViews);
  return runReadOnlyQuery({ text: withRowCap(sql), searchPath: AI_SCHEMA });
}
