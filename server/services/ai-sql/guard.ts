/**
 * AI analytics: the SQL guard (ported from SMEEP, which took it from Sama's
 * AI Insights).
 *
 * Everything the AI agents write passes through here before it reaches a
 * database connection. The guard parses the SQL and rejects anything that is
 * not a single, read-only SELECT over the catalogued `ai` views.
 *
 * It is not the only boundary. Queries run as the `hadafi_ai_readonly` role
 * (AI_READONLY_DATABASE_URL), whose GRANTs make a write or a read of a real
 * table impossible whatever gets past this file, inside a READ ONLY
 * transaction with a statement timeout. The guard's job is to fail fast, with
 * a message the model can act on, and to keep the agent on the catalogue.
 */

import { astVisitor, parse, type Statement } from "pgsql-ast-parser";
import { AppError } from "../../utils/app-error";
import { MAX_SQL_LENGTH } from "./limits";

/** The schema a generated query may name unless the caller says otherwise. */
export const AI_SCHEMA = "ai";

/**
 * Function names a generated query may not call. Prefixes cover the whole
 * `pg_*` catalogue surface (`pg_read_file`, `pg_sleep`, `pg_terminate_backend`,
 * …) and the large-object API in one rule each. Deliberately a denylist: an
 * allowlist would have to enumerate `date_trunc`, `to_char`, `coalesce` and
 * hundreds more, and every omission would present as the assistant
 * inexplicably failing at a reasonable question.
 */
const DENIED_FUNCTION_PREFIXES = ["pg_", "lo_", "dblink", "has_", "pgp_", "binary_upgrade_", "brin_", "gin_"];
const DENIED_FUNCTIONS = new Set([
  "set_config",
  "current_setting",
  "copy_from",
  "nextval",
  "setval",
  "currval",
  "lastval",
  "version",
  // These two run a query passed to them as TEXT — the one way a function call
  // could read a base table the guard never saw as a table reference.
  "ts_stat",
  "ts_rewrite",
  // Catalogue and session introspection: nothing a report needs.
  "current_query",
  "current_database",
  "current_schema",
  "current_schemas",
  "getpgusername",
  "obj_description",
  "col_description",
  "shobj_description",
  "acldefault",
  "aclexplode",
  "makeaclitem",
]);
/**
 * Function-name families too broad for an exact list: anything XML (the
 * `*_to_xml`, `*_to_xmlschema` and `*_to_xml_and_xmlschema` exporters read
 * whole tables or run a query given as TEXT; no report needs XML), every
 * `query_/table_/cursor_/schema_/database_to_*` exporter whatever its suffix,
 * the xpath parsers, transaction-id and network-introspection functions, and
 * every `to_reg*` OID cast.
 */
const DENIED_FUNCTION_PATTERNS: RegExp[] = [
  /xml/,
  /^(query|table|cursor|schema|database)_to_/,
  /^xpath/,
  /^txid_/,
  /^inet_/,
  /^to_reg/,
];
/** Types whose whole purpose is resolving a name to a catalogue OID. */
const DENIED_CAST_TYPES = new Set([
  "regclass",
  "regproc",
  "regprocedure",
  "regoper",
  "regoperator",
  "regtype",
  "regrole",
  "regnamespace",
  "regconfig",
  "regdictionary",
  "regcollation",
]);

/** Statement kinds that are read-only by construction. */
const ALLOWED_STATEMENT_TYPES = new Set(["select", "with", "with recursive", "union", "union all", "values"]);

export interface GuardResult {
  ok: boolean;
  /** Human- and model-readable reasons. Empty when ok. */
  errors: string[];
  /** Relations the query reads, for logging. Present only when ok. */
  relations?: string[];
}

/**
 * A rejected or failed AI query. `errors` is the full list of reasons, which
 * the AI routes return verbatim — it is the agent's correction signal.
 */
export class AiSqlError extends AppError {
  public readonly errors: string[];

  constructor(message: string, statusCode: number, code: string, errors: string[] = [message]) {
    super(message, statusCode, code);
    this.name = "AiSqlError";
    this.errors = errors;
    Object.setPrototypeOf(this, AiSqlError.prototype);
  }
}

/**
 * Validates one generated query against the allowlist.
 *
 * @param sql          the raw SQL as written by the agent
 * @param allowedViews the view names (unqualified) the agent is allowed to read
 * @param schema       the only schema a table reference may name (default `ai`)
 * @param options.reservedPrefix  names starting with this (any case, anywhere in
 *                     the text) are refused: reserved for the executor's own
 *                     identifiers
 */
export function validateSql(
  sql: string,
  allowedViews: readonly string[],
  schema: string = AI_SCHEMA,
  options: { reservedPrefix?: string } = {},
): GuardResult {
  const allowedSchema = schema.toLowerCase();
  /** Schemas a function call may be qualified with. */
  const allowedFunctionSchemas = new Set([allowedSchema, "pg_catalog"]);
  const trimmed = sql.trim();

  if (trimmed.length === 0) {
    return { ok: false, errors: ["The query was empty."] };
  }
  if (trimmed.length > MAX_SQL_LENGTH) {
    return { ok: false, errors: [`The query is too long (${MAX_SQL_LENGTH.toLocaleString("en-US")} character limit).`] };
  }
  const reserved = options.reservedPrefix?.toLowerCase();
  if (reserved && trimmed.toLowerCase().includes(reserved)) {
    return {
      ok: false,
      errors: [`Names starting with "${reserved}" are reserved. Query the views as "${allowedSchema}.<view>".`],
    };
  }

  let statements: Statement[];
  try {
    statements = parse(trimmed);
  } catch (err) {
    // The parser's message names the line and column, which is exactly what the
    // model needs to fix its own query, so it is passed through (first line).
    const message = (err as Error).message.split("\n")[0] ?? "syntax error";
    return { ok: false, errors: [`The query could not be parsed: ${message}`] };
  }

  if (statements.length !== 1) {
    return {
      ok: false,
      errors: [
        `Send exactly one statement; this contained ${statements.length}. ` +
          "Separate queries must be sent as separate calls.",
      ],
    };
  }

  const statement = statements[0]!;
  if (!ALLOWED_STATEMENT_TYPES.has(statement.type)) {
    return {
      ok: false,
      errors: [
        `Only SELECT queries are allowed; this was a ${statement.type.toUpperCase()} statement. ` +
          "The data is read-only.",
      ],
    };
  }

  // Names introduced by the query itself (CTEs). Reassigned, not mutated, on
  // entering/leaving each WITH, so a CTE's name is visible only within its own
  // WITH and cannot whitelist an unrelated table reference elsewhere.
  let localNames = new Set<string>();
  const relations = new Set<string>();
  const badRelations = new Set<string>();
  const badFunctions = new Set<string>();
  const badCasts = new Set<string>();
  let locking = false;
  let intoTarget = false;
  // A data-modifying statement nested in a WITH (`WITH x AS (DELETE ...)`)
  // still parses as a "with" statement, so the top-level type check alone
  // would let it through. The read-only transaction and the role would
  // refuse it too; this catches it first, with a clear error.
  let nestedWrite = "";

  const allowed = new Set(allowedViews.map((v) => v.toLowerCase()));

  const visitor = astVisitor((map) => ({
    with: (w) => {
      const saved = localNames;
      const next = new Set(saved);
      for (const bind of w.bind ?? []) {
        if (bind.alias?.name) next.add(bind.alias.name.toLowerCase());
      }
      localNames = next;
      map.super().with(w);
      localNames = saved;
    },
    withRecursive: (w) => {
      const saved = localNames;
      const next = new Set(saved);
      // `bind` is the recursive term itself, not a list of bindings — the one
      // name this CTE introduces is the singular `w.alias`.
      if (w.alias?.name) next.add(w.alias.name.toLowerCase());
      localNames = next;
      map.super().withRecursive(w);
      localNames = saved;
    },
    cast: (c) => {
      let to = c.to;
      while (to.kind === "array") to = to.arrayOf;
      if (to.name && DENIED_CAST_TYPES.has(to.name.toLowerCase())) {
        badCasts.add(to.name.toLowerCase());
      }
      map.super().cast(c);
    },
    tableRef: (t) => {
      const refSchema = t.schema?.toLowerCase();
      const name = t.name.toLowerCase();

      if (refSchema && refSchema !== allowedSchema) {
        // Names pg_catalog, information_schema, public — anything but ours.
        badRelations.add(`${refSchema}.${name}`);
      } else if (!allowed.has(name) && !(localNames.has(name) && !refSchema)) {
        badRelations.add(refSchema ? `${refSchema}.${name}` : name);
      } else if (allowed.has(name) && (refSchema || !localNames.has(name))) {
        relations.add(`${allowedSchema}.${name}`);
      }
      map.super().tableRef(t);
    },
    call: (c) => {
      const fn = c.function?.name?.toLowerCase();
      const fnSchema = c.function?.schema?.toLowerCase();
      if (fn) {
        const denied =
          (fnSchema !== undefined && !allowedFunctionSchemas.has(fnSchema)) ||
          DENIED_FUNCTIONS.has(fn) ||
          DENIED_FUNCTION_PREFIXES.some((p) => fn.startsWith(p)) ||
          DENIED_FUNCTION_PATTERNS.some((p) => p.test(fn));
        if (denied) badFunctions.add(fnSchema ? `${fnSchema}.${fn}` : fn);
      }
      map.super().call(c);
    },
    insert: (st) => {
      nestedWrite ||= "INSERT";
      map.super().insert(st);
    },
    update: (st) => {
      nestedWrite ||= "UPDATE";
      map.super().update(st);
    },
    delete: (st) => {
      nestedWrite ||= "DELETE";
      map.super().delete(st);
    },
    selection: (s) => {
      // `SELECT ... FOR UPDATE` / `FOR SHARE` takes row locks, which a
      // read-only transaction rejects anyway; caught here for a clearer error.
      if ((s as { for?: unknown }).for) locking = true;
      if ((s as { into?: unknown }).into) intoTarget = true;
      map.super().selection(s);
    },
  }));

  visitor.statement(statement);

  const errors: string[] = [];

  if (badRelations.size > 0) {
    const list = [...badRelations].sort().join(", ");
    errors.push(
      `Unknown or forbidden table(s): ${list}. ` +
        `Query only the views listed in the catalogue, each written as "${allowedSchema}.<view>".`,
    );
  }
  if (badFunctions.size > 0) {
    errors.push(
      `Forbidden function(s): ${[...badFunctions].sort().join(", ")}. ` +
        "System and catalogue functions are not available.",
    );
  }
  if (badCasts.size > 0) {
    errors.push(
      `Forbidden cast(s) to: ${[...badCasts].sort().join(", ")}. ` +
        "Casts that resolve a name to a catalogue OID are not available.",
    );
  }
  if (nestedWrite) {
    errors.push(`Only SELECT queries are allowed; this contained a ${nestedWrite}. The data is read-only.`);
  }
  if (locking) {
    errors.push("Row locking (FOR UPDATE / FOR SHARE) is not allowed on read-only data.");
  }
  if (intoTarget) {
    errors.push("SELECT ... INTO is not allowed; the data is read-only.");
  }
  if (relations.size === 0 && badRelations.size === 0) {
    // `SELECT 1`, or a CTE over nothing, is legal SQL but never a real answer,
    // and is the shape a probing injection tends to take.
    errors.push(`The query did not read any ${allowedSchema} view.`);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, errors: [], relations: [...relations].sort() };
}

/** `validateSql`, but throws `AiSqlError(400, "SQL_REJECTED")` instead of returning a result. */
export function assertSafeSql(
  sql: string,
  allowedViews: readonly string[],
  schema: string = AI_SCHEMA,
  options: { reservedPrefix?: string } = {},
): string[] {
  const result = validateSql(sql, allowedViews, schema, options);
  if (!result.ok) {
    throw new AiSqlError(result.errors.join(" "), 400, "SQL_REJECTED", result.errors);
  }
  return result.relations ?? [];
}
