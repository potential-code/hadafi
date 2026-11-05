/**
 * AI analytics: SQL guard tests (ported from SMEEP / Sama).
 *
 * Pure, no database. These pin the shapes the guard must reject and, just as
 * importantly, the ordinary analytical SQL it must let through. A guard that
 * blocks `date_trunc` is a broken feature, not a safe one.
 */
import { describe, expect, test } from "bun:test";
import { validateSql } from "../services/ai-sql/guard";
import { evaluateRoleSafety } from "../services/ai-sql/readonly-pool";
import { catalogViewNames } from "../services/ai-sql/schema-catalog";

const VIEWS = catalogViewNames();

const reject = (sql: string) => {
  const result = validateSql(sql, VIEWS);
  expect(result.ok).toBe(false);
  return result.errors.join(" ");
};

const accept = (sql: string) => {
  const result = validateSql(sql, VIEWS);
  if (!result.ok) throw new Error(`expected accept, got: ${result.errors.join("; ")}`);
  return result;
};

describe("guard — rejects", () => {
  test("data definition", () => {
    expect(reject("DROP TABLE users")).toContain("Only SELECT");
    expect(reject("CREATE TABLE t (i int)")).toContain("Only SELECT");
    expect(reject("TRUNCATE ai.learner")).toContain("Only SELECT");
  });

  test("data modification", () => {
    expect(reject("INSERT INTO ai.learner VALUES (1)")).toContain("Only SELECT");
    expect(reject("UPDATE ai.learner SET country = 'x'")).toContain("Only SELECT");
    expect(reject("DELETE FROM ai.course")).toContain("Only SELECT");
  });

  test("tables outside the ai schema", () => {
    expect(reject("SELECT * FROM public.users")).toContain("public.users");
    expect(reject("SELECT * FROM users")).toContain("users");
    expect(reject("SELECT * FROM auth_sessions")).toContain("auth_sessions");
    expect(reject("SELECT * FROM information_schema.tables")).toContain("information_schema");
    expect(reject("SELECT * FROM pg_catalog.pg_authid")).toContain("pg_catalog");
  });

  test("a view that does not exist", () => {
    expect(reject("SELECT * FROM ai.salaries")).toContain("ai.salaries");
  });

  test("system functions", () => {
    expect(reject("SELECT pg_sleep(10) FROM ai.learner")).toContain("pg_sleep");
    expect(reject("SELECT set_config('x','y',true) FROM ai.learner")).toContain("set_config");
    expect(reject("SELECT pg_read_file('/etc/passwd') FROM ai.learner")).toContain("pg_read_file");
  });

  test("functions that run a query given as text", () => {
    expect(reject("SELECT * FROM ai.learner, ts_stat('SELECT to_tsvector(email) FROM users') s")).toContain("ts_stat");
    expect(reject("SELECT query_to_xml('select * from users', true, false, '') FROM ai.learner")).toContain(
      "query_to_xml",
    );
  });

  test("a function qualified with a schema other than ai or pg_catalog", () => {
    expect(reject("SELECT public.some_fn(learner_id) FROM ai.learner")).toContain("public.some_fn");
  });

  test("multiple statements", () => {
    expect(reject("SELECT 1 FROM ai.learner; SELECT 2 FROM ai.learner")).toContain("exactly one statement");
    expect(reject("SELECT 1 FROM ai.learner; DELETE FROM users")).toContain("exactly one statement");
  });

  test("row locking", () => {
    expect(reject("SELECT * FROM ai.learner FOR UPDATE")).toContain("Row locking");
  });

  test("select into", () => {
    // pgsql-ast-parser has no grammar rule for SELECT ... INTO, so this is a
    // parse-stage rejection — still a hard rejection.
    reject("SELECT * INTO leaked FROM ai.learner");
  });

  test("a query that reads nothing", () => {
    expect(reject("SELECT 1")).toContain("did not read any ai view");
  });

  test("empty and oversized input", () => {
    expect(reject("   ")).toContain("empty");
    expect(reject(`SELECT '${"x".repeat(20_001)}' FROM ai.learner`)).toContain("too long");
  });

  test("unparseable input", () => {
    expect(reject("SELECT FROM WHERE")).toContain("could not be parsed");
  });

  test("a forbidden table hidden inside a subquery", () => {
    expect(reject("SELECT count(*) FROM ai.learner WHERE learner_id IN (SELECT id FROM public.users)")).toContain(
      "public.users",
    );
  });

  test("a forbidden table hidden inside a CTE", () => {
    expect(reject("WITH leaked AS (SELECT * FROM public.users) SELECT * FROM leaked")).toContain("public.users");
  });

  test("a CTE cannot shadow a forbidden table into looking allowed", () => {
    expect(reject("WITH users AS (SELECT * FROM public.users) SELECT * FROM users")).toContain("public.users");
  });

  test("a CTE declared inside a nested subquery does not leak into scope outside it", () => {
    expect(
      reject(
        "SELECT r.rolname FROM ai.learner l " +
          "RIGHT JOIN (WITH pg_roles AS (SELECT 1) SELECT 1) a ON true, pg_roles r",
      ),
    ).toContain("pg_roles");
  });

  test("a CTE alone does not satisfy the 'read a real view' requirement", () => {
    expect(reject("WITH x AS (SELECT 1) SELECT * FROM x")).toContain("did not read any ai view");
  });

  test("XML export and parsing functions", () => {
    expect(reject("SELECT table_to_xml('public.users', true, false, '') FROM ai.course")).toContain("table_to_xml");
    expect(reject("SELECT xpath('/a', xml '<a/>') FROM ai.course")).toContain("xpath");
  });

  test("the _and_xmlschema exporters, which run a query given as text", () => {
    expect(
      reject("SELECT query_to_xml_and_xmlschema('select id, password from public.auth_accounts', true, false, '') FROM ai.learner"),
    ).toContain("query_to_xml_and_xmlschema");
    expect(reject("SELECT table_to_xml_and_xmlschema('public.auth_sessions', true, false, '') FROM ai.learner")).toContain(
      "table_to_xml_and_xmlschema",
    );
    expect(reject("SELECT pg_catalog.database_to_xml_and_xmlschema(true, false, '') FROM ai.learner")).toContain(
      "database_to_xml_and_xmlschema",
    );
    expect(reject("SELECT schema_to_xmlschema('public', true, false, '') FROM ai.learner")).toContain("schema_to_xmlschema");
    expect(reject("SELECT cursor_to_xml('c', 10, true, false, '') FROM ai.learner")).toContain("cursor_to_xml");
  });

  test("transaction id, sequence, version and network functions", () => {
    expect(reject("SELECT txid_current() FROM ai.course")).toContain("txid_current");
    expect(reject("SELECT nextval('some_seq') FROM ai.course")).toContain("nextval");
    expect(reject("SELECT version() FROM ai.course")).toContain("version");
    expect(reject("SELECT inet_client_addr() FROM ai.course")).toContain("inet_client_addr");
  });

  test("casts to a reg* OID type", () => {
    expect(reject("SELECT 'ai.learner'::regclass")).toContain("regclass");
    expect(reject("SELECT CAST('ai.learner' AS regclass) FROM ai.course")).toContain("regclass");
  });
});

describe("guard — accepts", () => {
  test("a simple aggregate", () => {
    const result = accept("SELECT country, count(*) FROM ai.learner GROUP BY country");
    expect(result.relations).toEqual(["ai.learner"]);
  });

  test("an unqualified view name (executed with search_path = ai)", () => {
    expect(accept("SELECT count(*) FROM learner").relations).toEqual(["ai.learner"]);
  });

  test("a join across views", () => {
    const result = accept(`
      SELECT c.title, count(*) FILTER (WHERE p.completed) AS completions
      FROM ai.course_progress p
      JOIN ai.course c ON c.course_id = p.course_id
      WHERE c.status = 'published'
      GROUP BY c.title
      ORDER BY completions DESC
    `);
    expect(result.relations).toEqual(["ai.course", "ai.course_progress"]);
  });

  test("CTEs, date functions and window functions", () => {
    accept(`
      WITH monthly AS (
        SELECT date_trunc('month', completed_on)::date AS m, count(*) AS n
        FROM ai.lesson_progress
        GROUP BY 1
      )
      SELECT to_char(m, 'YYYY-MM') AS month, n, sum(n) OVER (ORDER BY m) AS running_total
      FROM monthly
      ORDER BY m
    `);
  });

  test("COUNT(DISTINCT ...) with HAVING", () => {
    accept(`
      SELECT l.country, count(DISTINCT l.learner_id) AS learners
      FROM ai.learner l
      JOIN ai.course_progress p ON p.learner_id = l.learner_id
      GROUP BY l.country
      HAVING count(DISTINCT l.learner_id) > 5
    `);
  });

  test("a UNION of two allowed selects", () => {
    accept("SELECT country FROM ai.learner UNION SELECT 'x' FROM ai.course");
  });

  test("a recursive CTE over a real view", () => {
    const result = accept(`
      WITH RECURSIVE counters (n) AS (
        SELECT 1
        UNION ALL
        SELECT n + 1 FROM counters WHERE n < 5
      )
      SELECT l.country, c.n FROM ai.learner l JOIN counters c ON true
    `);
    expect(result.relations).toEqual(["ai.learner"]);
  });

  test("ordinary casts and the schema's own helper functions", () => {
    accept("SELECT count(*)::int, country::text FROM ai.learner GROUP BY country");
    accept("SELECT ai.country_name('AE') FROM ai.learner");
  });
});

describe("guard: the real catalogue", () => {
  test("every base table behind the views is refused by name", () => {
    for (const table of ["users", "auth_accounts", "auth_sessions", "offer_redemptions", "mentor_sessions", "stakeholder_registrations", "organisations", "ai_dashboards"]) {
      expect(reject(`SELECT count(*) FROM ${table}`)).toContain(table);
      expect(reject(`SELECT count(*) FROM public.${table}`)).toContain(`public.${table}`);
    }
    // ai.event_attendance shares its name with the base table: unqualified, it
    // resolves to the view (search_path = ai); qualified, the table is refused.
    expect(reject("SELECT count(*) FROM public.event_attendance")).toContain("public.event_attendance");
  });

  test("a write hidden in a CTE is refused", () => {
    expect(reject("WITH gone AS (DELETE FROM ai.learner RETURNING learner_id) SELECT count(*) FROM gone")).toContain("DELETE");
    expect(reject("WITH x AS (UPDATE ai.course SET title = 'x' RETURNING course_id) SELECT * FROM x")).toContain("UPDATE");
    expect(reject("WITH x AS (INSERT INTO ai.course (title) VALUES ('x') RETURNING course_id) SELECT * FROM x")).toContain("INSERT");
  });

  test("every catalogued view is accepted", () => {
    for (const view of VIEWS) accept(`SELECT count(*) FROM ai.${view}`);
  });
});

describe("read-only role safety", () => {
  const safe = {
    can_read_users: false,
    can_read_auth_accounts: false,
    is_superuser: false,
    bypasses_rls: false,
    can_create_roles_or_dbs: false,
    can_create_in_ai: false,
    can_create_in_public: false,
    db_user: "hadafi_ai_readonly",
  };

  test("a role that can only read ai is safe", () => {
    expect(evaluateRoleSafety(safe)).toEqual({ safe: true });
  });

  test("any extra right makes it unsafe, and says which", () => {
    for (const key of Object.keys(safe).filter((k) => k !== "db_user") as (keyof typeof safe)[]) {
      const verdict = evaluateRoleSafety({ ...safe, [key]: true });
      expect(verdict.safe).toBe(false);
    }
    const verdict = evaluateRoleSafety({ ...safe, can_read_users: true, is_superuser: true });
    expect(verdict).toEqual({ safe: false, reason: "can read public.users, is superuser", currentUser: "hadafi_ai_readonly" });
  });
});
