# AI analytics: AI Insights and the AI Dashboard

Admins ask Hana questions about Hadafi's data (AI Insights) or build charts from a sentence (AI Dashboard).
The agents run in potential-ai (`dataChat` and `dashboardBuilder`, platformId `hadafi`, admin-scoped token
from `/api/account/copilot-token`). They only ever see a catalogue of the `ai` reporting views. Every SQL
statement they write is checked and run by the Hadafi server, as a read-only database role. Ported from SMEEP
(`dee380d`, `9c295c7`, `4e89bc4`).

Sources of truth:

- `server/db/aiViews/001_ai_schema.sql`: the views (shipped by migration `0029_ai_views`).
- `server/services/ai-sql/schema-catalog.ts`: what the agents are told (the `sql-1.2.0` catalogue).
- `server/services/ai-sql/guard.ts`, `execute.ts`, `limits.ts`, `readonly-pool.ts`: what SQL is accepted and how it runs.
- `server/scripts/ai-readonly-role.mjs` (and `.sql` for doing it by hand): the read-only role.

## No personal data

`ai` is a schema of plain views over Hadafi's tables. A person is reduced to the platform's `users.id`
(`learner_id`, `mentor_id`) plus category labels. That is pseudonymous, not anonymous: an admin can map an
id back to a person.

The views never expose:

- names, emails, phones, bios or companies;
- avatar or image URLs;
- meeting, Zoom, recording or LinkedIn links, locations or passcodes;
- mentor notes, answers, or notification and announcement text;
- billing fields or Stripe ids;
- certificate numbers, URLs or file paths;
- organisation names or join codes;
- anything from `auth_*`.

Learner-keyed views hold `users.role = 'sme'` only. Stakeholder registrations appear as monthly counts only.
`server/tests/ai-schema.test.ts` checks the live columns against a list of personal-data patterns, and scans
text values for emails and links.

## Running generated SQL

- **Guard.** Exactly one `SELECT`/`WITH`/`UNION`/`VALUES`, reading catalogued `ai` views only. No writes, even
  inside a CTE. No `pg_*`, introspection, XML or text-query functions, `reg*` casts, `FOR UPDATE` or
  `SELECT … INTO`.
- **Execution.**
  - It runs as `hadafi_ai_readonly` in `BEGIN READ ONLY`, with `statement_timeout = 15000` and
    `search_path = ai`.
  - The query is wrapped as `SELECT * FROM (<sql>) LIMIT 501`: 500 rows come back, and `truncated` says
    whether there were more.
  - At most 4 queries run at once, and 120 requests per 5 minutes per admin.
- **The role is the boundary.**
  - It can only `SELECT` the `ai` views. Plain views run with their owner's rights, so it needs no grant
    on the base tables.
  - On first use each process asks Postgres what the role can do. If it can read `users` or
    `auth_accounts`, is superuser, bypasses RLS, can create roles, or can create in `ai` or `public`,
    every query is refused with 503 `AI_READONLY_ROLE_UNSAFE`.
- **No fallback.** Without `AI_READONLY_DATABASE_URL` the routes answer 503 `AI_READONLY_NOT_CONFIGURED` and
  the pages say AI Insights isn't set up. Nothing ever runs on the app's own connection.

## API (`/api/admin/ai`, admins only)

| Route | Body | Response `data` |
|---|---|---|
| `GET /catalog` | none | the `sql-1.2.0` catalogue (`version, dialect, schema, refreshedAt, views[], enums, notes[], instructions[], limits, chartTypes[], chartDescriptors[]`) |
| `POST /query` | `{ sql }` | `{ columns, columnTypes, rows, rowCount, truncated, elapsedMs }` |
| `POST /report` (`?format=pdf\|xlsx`) | `ReportSpec` | file `hadafi-report-YYYY-MM-DD.pdf` / `.xlsx`; every figure is re-run |
| `GET /dashboards` | none | saved boards, newest first (shared by all admins) |
| `POST /dashboards` | `{ title, charts }` | the board (201) |
| `GET`, `PUT`, `DELETE /dashboards/:id` | `PUT`: `{ title, charts }` | the board / `{ deleted: true }` |

Errors use the body `{ success: false, error: { message, code, errors[] } }`. The `errors` list is the
agent's correction signal.

- Guard rejection: 400 `SQL_REJECTED`.
- Postgres error: 400 `SQL_FAILED`.
- Timeout: 400 `SQL_TIMEOUT`.
- Bad body: 422.

The pages send the catalogue to potential-ai as the `__catalog__` agent context. They send no
`__system_prompt__`: the catalogue's `instructions` carry the house rules, so no prompt fingerprint is needed
in the admin token.

## Release

1. Deploy. The entrypoint runs the migrations, and `0029_ai_views` creates `ai_dashboards` and the `ai`
   views.
2. In the server container, from `/app`:
   - `node scripts/ai-readonly-role.mjs create` previews the change (it rolls back).
   - `node scripts/ai-readonly-role.mjs create --apply` creates `hadafi_ai_readonly` with a random
     password. It grants SELECT on `ai` only, read-only, with a 15 s timeout. It also removes Postgres
     < 15's default CREATE on `public` from PUBLIC, when it is safe to.
   - It prints `AI_READONLY_DATABASE_URL=…` once. If the value is lost, re-run with
     `--new-password --apply`.
   - `DATABASE_URL` must be able to create roles. If it can't, run `scripts/ai-readonly-role.sql` by hand.
3. Set `AI_READONLY_DATABASE_URL` on the server in Dokploy and redeploy.
4. Run `node scripts/ai-readonly-role.mjs check`. It connects as the role and must show that it reads the
   views but is refused `users`, `auth_accounts`, `offer_redemptions`, `pg_authid` and every write.

A prod-prep script can import `ensureAiReadonlyRole`, `aiReadonlyUrl` and `checkAiReadonlyRole` from
`scripts/ai-readonly-role.mjs` instead of shelling out.

## Changing the views (and changing tables they read)

Views are derived objects that Postgres ties to their base columns. Two rules follow.

**Another migration drops, renames or retypes a column a view reads.** Postgres refuses with "cannot drop
column … because other objects depend on it" (or "cannot alter type of a column used by a view").

- Generate that migration as usual, then hand-edit it. Start it with the drop block from the top of
  `001_ai_schema.sql` (it drops every `ai` view).
- End it with the whole updated `001_ai_schema.sql`. The file drops and recreates every view and
  re-grants the role.
- The read-only role keeps working, because the default privileges cover new views.

**Adding a table or column needs nothing.** Views only read the columns they name.

To expose something new, or to change a view:

1. Edit `001_ai_schema.sql`. No personal data: ids and category labels only. Aggregate anything about a
   named person or organisation.
2. Update `schema-catalog.ts`: the view, its columns in order, and any enums. Bump `SQL_CATALOG_VERSION`'s
   major only when a view or column is removed or renamed.
3. Run `npx drizzle-kit generate --config ./drizzle.config.ts --custom --name ai_views_<what>` and paste
   the whole file into the new migration.
4. Run `server/tests/ai-schema.test.ts`. It fails when the live views and the catalogue differ, when a
   column name looks personal, or when the newest view migration doesn't carry the file verbatim.
