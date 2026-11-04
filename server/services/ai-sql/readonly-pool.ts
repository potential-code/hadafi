/**
 * AI analytics: the database connection generated SQL runs on.
 *
 * Only ever the dedicated `hadafi_ai_readonly` role, from
 * AI_READONLY_DATABASE_URL. That role can SELECT the `ai` views and do
 * nothing else anywhere (server/scripts/ai-readonly-role.mjs), so its GRANTs
 * are the security boundary: even a query that got past the SQL guard could
 * read nothing but the `ai` views and write nothing at all.
 *
 * There is deliberately NO fallback to the app's own connection (unlike
 * SMEEP): without the setting, AI Insights and the AI Dashboard answer 503
 * AI_READONLY_NOT_CONFIGURED and the pages say they aren't set up yet.
 * `checkReadonlyRoleSafety()` also refuses to run anything if the configured
 * role turns out to hold more than it should.
 */

import pg from "pg";
import { AiSqlError } from "./guard";
import { AI_STATEMENT_TIMEOUT_MS } from "./limits";

export const AI_READONLY_ROLE = "hadafi_ai_readonly";

let readonlyPool: pg.Pool | null = null;
let poolUrl = "";

export function readonlyDatabaseUrl(): string {
  return (process.env["AI_READONLY_DATABASE_URL"] ?? "").trim();
}

/** True when the read-only role is configured for this environment. */
export function isAiReadonlyConfigured(): boolean {
  return readonlyDatabaseUrl().length > 0;
}

/** 503 with a code the admin pages turn into "not set up for this environment". */
export function notConfiguredError(): AiSqlError {
  return new AiSqlError(
    "AI Insights isn't set up for this environment yet (AI_READONLY_DATABASE_URL is not set).",
    503,
    "AI_READONLY_NOT_CONFIGURED",
  );
}

/** The read-only role's pool. Throws 503 AI_READONLY_NOT_CONFIGURED when the setting is missing. */
export function getAiQueryPool(): pg.Pool {
  const url = readonlyDatabaseUrl();
  if (!url) throw notConfiguredError();
  if (readonlyPool && poolUrl !== url) {
    // The setting changed under a running process (tests do this): start over.
    void closeAiReadonlyPool();
  }
  if (!readonlyPool) {
    poolUrl = url;
    // Small on purpose: an LLM will occasionally write an expensive query, and
    // a narrow pool keeps that cost from spreading.
    readonlyPool = new pg.Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Duplicates the role-level settings (ALTER ROLE ... SET) so the ceiling
      // holds even if the role was provisioned by hand and that step missed.
      statement_timeout: AI_STATEMENT_TIMEOUT_MS,
      options: "-c default_transaction_read_only=on -c search_path=ai",
      application_name: "hadafi_ai_analytics",
    });
    readonlyPool.on("error", (err) => console.error("[ai-readonly] idle client error:", err.message));
  }
  return readonlyPool;
}

/** Closes the read-only pool (tests, and a changed setting). */
export async function closeAiReadonlyPool(): Promise<void> {
  const p = readonlyPool;
  readonlyPool = null;
  poolUrl = "";
  roleSafetyCheck = null;
  if (p) await p.end().catch(() => {});
}

export interface RoleSafetyCheckRow {
  can_read_users: boolean;
  can_read_auth_accounts: boolean;
  is_superuser: boolean;
  bypasses_rls: boolean;
  can_create_roles_or_dbs: boolean;
  can_create_in_ai: boolean;
  can_create_in_public: boolean;
  db_user: string;
}

export type RoleSafetyResult = { safe: true } | { safe: false; reason: string; currentUser: string };

/**
 * The privilege check is trusted, the role's name is not: a role could be
 * named to look read-only and still hold real access. Pure, so it is
 * unit-testable without a connection.
 */
export function evaluateRoleSafety(row: RoleSafetyCheckRow): RoleSafetyResult {
  const failed: string[] = [];
  if (row.can_read_users) failed.push("can read public.users");
  if (row.can_read_auth_accounts) failed.push("can read public.auth_accounts");
  if (row.is_superuser) failed.push("is superuser");
  if (row.bypasses_rls) failed.push("bypasses RLS");
  if (row.can_create_roles_or_dbs) failed.push("can create roles or databases");
  if (row.can_create_in_ai) failed.push("can create in the ai schema");
  if (row.can_create_in_public) failed.push("can create in the public schema");
  if (failed.length === 0) return { safe: true };
  return { safe: false, reason: failed.join(", "), currentUser: row.db_user };
}

let roleSafetyCheck: Promise<RoleSafetyResult> | null = null;

/** The SQL the safety check runs as the connected role (shared with the role script). */
export const ROLE_SAFETY_SQL = `
  SELECT
    has_table_privilege('public.users', 'select') AS can_read_users,
    coalesce(has_table_privilege(to_regclass('public.auth_accounts'), 'select'), false) AS can_read_auth_accounts,
    r.rolsuper AS is_superuser,
    r.rolbypassrls AS bypasses_rls,
    (r.rolcreaterole OR r.rolcreatedb) AS can_create_roles_or_dbs,
    has_schema_privilege('ai', 'create') AS can_create_in_ai,
    has_schema_privilege('public', 'create') AS can_create_in_public,
    current_user AS db_user
  FROM pg_roles r
  WHERE r.rolname = current_user
`;

/**
 * Confirms, by asking Postgres, that the configured role really can do no
 * more than SELECT on `ai`. Cached for the life of the pool once it produces
 * a verdict; a connection failure is not a verdict, so the next call retries.
 */
export async function checkReadonlyRoleSafety(p: pg.Pool): Promise<RoleSafetyResult> {
  if (roleSafetyCheck) return roleSafetyCheck;
  const promise = (async (): Promise<RoleSafetyResult> => {
    const { rows } = await p.query<RoleSafetyCheckRow>(ROLE_SAFETY_SQL);
    const row = rows[0];
    if (!row) return { safe: false, reason: "no pg_roles row matched current_user", currentUser: "" };
    const result = evaluateRoleSafety(row);
    if (!result.safe) {
      console.error(
        `[ai-readonly] refusing to query: the role is not safe (current_user=${result.currentUser}): ${result.reason}`,
      );
    }
    return result;
  })();
  roleSafetyCheck = promise;
  try {
    return await promise;
  } catch (err) {
    roleSafetyCheck = null;
    throw err;
  }
}
