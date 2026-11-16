# Operator access (Maya, the AI operator)

Maya calls the Hadafi admin API without a browser session. She sends an
**operator key** as `Authorization: Bearer <key>`, and the server treats the
request as coming from one dedicated admin account, the **service account**
(for Hadafi: `maya@potential.org`). Every change she makes is written to
`admin_audit_log`. Every change made by a human admin is written there too.

Ported from SMEEP (`potential-smeep`, `server/docs/operator-access.md`, live in
production). The core (keys, scope check, sign-in refusal, audit log, scripts)
is the same code; the allowlist is mapped to Hadafi's routes, and the
differences are listed at the end.

## How it works

| Piece | Where |
| --- | --- |
| Key check, service-account lookup | `server/auth/operatorKeys.ts`, called from `server/middleware/authenticate.ts` |
| What a key may call (allowlist) | `server/auth/operatorScope.ts` (table below) |
| Sign-in refusal for the service account | before hook in `server/auth/index.ts`; session check in `server/middleware/authenticate.ts` |
| Announcement limit for keys | `server/middleware/limits.ts` (`operatorAnnouncementLimit`), used in `server/routes/announcements.ts` |
| Audit log middleware | `server/middleware/audit-log.ts` (mounted on `/api` in `server/index.ts`) |
| Audit table | `admin_audit_log`, migration `0034_admin_audit_log` |
| Scripts | `server/scripts/generate-operator-key.mjs`, `server/scripts/create-operator-user.mjs` |
| Tests | `server/tests/operator-access.test.ts`, `operator-scope.test.ts`, `admin-audit-log.test.ts` (with `tests/node/audit-pipelining.harness.ts`, run under real Node), `operator-scripts.test.ts` |

Environment (server service):

- `OPERATOR_API_KEYS`: one or more `label:sha256hex` entries, separated by
  commas. These are SHA-256 hashes of the keys. The raw keys are never on the
  server. **If this is unset or empty, Bearer headers are ignored entirely.**
- `OPERATOR_SERVICE_USER_EMAIL`: the admin account every valid key acts as
  (`maya@potential.org`).

Both compose files (`docker-compose.yml`, `docker-compose.staging.yml`) pass
these through, and `.env.example` lists them.

## What a key may call

A key is **not** full admin. It reaches only the method + path patterns below
(`server/auth/operatorScope.ts`, `OPERATOR_ROUTES`); anything else answers
**403** for a key (`{"success":false,"error":{"code":"FORBIDDEN"}}`) and logs
`[operator-scope] refused <METHOD> <route shape>` with ids replaced by
`:param`. Admin sessions are not affected. `:name` matches one path segment;
matching is case-insensitive with an optional trailing slash, as Express
routes. A test (`operator-scope.test.ts`) checks that every entry is a route
Hadafi really serves.

**The potential-ai operator adapter for Hadafi is built against this table.
When it adds or changes a tool, add its route to `operatorScope.ts` and to
this table in the same change, or the tool gets a 403.**

| # | Method | Path | What it is | SMEEP equivalent |
| --- | --- | --- | --- | --- |
| | | **Offers** | | |
| 1 | GET | `/api/admin/offers` | All offers, any status, with redemption counts | same |
| 2 | GET | `/api/offers/:id` | One offer | same |
| 3 | POST | `/api/admin/offers` | Create an offer | same |
| 4 | PATCH | `/api/admin/offers/:id` | Edit an offer | same |
| 5 | DELETE | `/api/admin/offers/:id` | Delete an offer | same |
| | | **Announcements** | | |
| 6 | GET | `/api/admin/announcements` | All announcements | same |
| 7 | GET | `/api/admin/announcements/audience` | How many people (and emails) an audience reaches (`?audience=&ref=`) | same |
| 8 | POST | `/api/admin/announcements` | Create and send, schedule or save as draft (`mode`). **Keys: 3 an hour, 10 a day** | same |
| 9 | POST | `/api/admin/announcements/:id/end` | Take a live banner down | `POST …/:id/archive` |
| | | **Live events** | | |
| 10 | GET | `/api/live-events/admin` | All events, any status | same |
| 11 | GET | `/api/live-events/admin/zoom` | Whether Zoom is set up | same |
| 12 | POST | `/api/live-events` | Create an event | same |
| 13 | PATCH | `/api/live-events/:id` | Edit an event | same |
| 14 | DELETE | `/api/live-events/:id` | Delete an event | same |
| 15 | GET | `/api/live-events/:id/bookings` | Who booked | same |
| 16 | GET | `/api/live-events/:id/bookings/export` | Bookers' names and emails as CSV/XLSX (`?format=csv`); audited | same |
| 17 | POST | `/api/live-events/:id/zoom/resync` | Re-create or update the Zoom meeting | same |
| | | **Courses (LMS authoring)** | | |
| 18 | GET | `/api/lms/admin/courses` | All courses | same |
| 19 | GET | `/api/lms/admin/courses/:id` | One course with its content | same |
| 20 | POST | `/api/lms/admin/courses` | Create a course | same |
| 21 | PATCH | `/api/lms/admin/courses/:id` | Edit a course | same |
| 22 | DELETE | `/api/lms/admin/courses/:id` | Delete a course | same |
| 23 | POST | `/api/lms/admin/courses/:id/modules` | Add a module | same |
| 24 | POST | `/api/lms/admin/courses/:id/modules/reorder` | Reorder modules | same |
| 25 | POST | `/api/lms/admin/courses/:id/assessments` | Add a pre-test or final exam | same |
| 26 | PATCH | `/api/lms/admin/modules/:id` | Edit a module | same |
| 27 | DELETE | `/api/lms/admin/modules/:id` | Delete a module | same |
| 28 | POST | `/api/lms/admin/modules/:id/units` | Add a unit | same |
| 29 | POST | `/api/lms/admin/modules/:id/units/reorder` | Reorder units | same |
| 30 | PATCH | `/api/lms/admin/units/:id` | Edit a unit | same |
| 31 | DELETE | `/api/lms/admin/units/:id` | Delete a unit | same |
| 32 | POST | `/api/lms/admin/units/:id/blocks` | Add a learning block | same |
| 33 | POST | `/api/lms/admin/units/:id/blocks/reorder` | Reorder blocks | same |
| 34 | PATCH | `/api/lms/admin/blocks/:id` | Edit a block | same |
| 35 | DELETE | `/api/lms/admin/blocks/:id` | Delete a block | same |
| 36 | POST | `/api/lms/admin/blocks/:id/questions` | Add a block question | same |
| 37 | POST | `/api/lms/admin/blocks/:id/questions/reorder` | Reorder block questions | same |
| 38 | PATCH | `/api/lms/admin/block-questions/:id` | Edit a block question | same |
| 39 | DELETE | `/api/lms/admin/block-questions/:id` | Delete a block question | same |
| 40 | PATCH | `/api/lms/admin/assessments/:id` | Edit an assessment | same |
| 41 | DELETE | `/api/lms/admin/assessments/:id` | Delete an assessment | same |
| 42 | POST | `/api/lms/admin/assessments/:id/questions` | Add an assessment question | same |
| 43 | POST | `/api/lms/admin/assessments/:id/questions/reorder` | Reorder assessment questions | same |
| 44 | PATCH | `/api/lms/admin/assessment-questions/:id` | Edit an assessment question | same |
| 45 | DELETE | `/api/lms/admin/assessment-questions/:id` | Delete an assessment question | same |
| | | **Organisations** | | |
| 46 | GET | `/api/admin/organisations` | All organisations | same |
| 47 | POST | `/api/admin/organisations` | Create one (`{ name, type }`) | same |
| 48 | PATCH | `/api/admin/organisations/:id` | Rename, change type, turn the join link on/off | same |
| 49 | DELETE | `/api/admin/organisations/:id` | Archive | same |
| 50 | POST | `/api/admin/organisations/:id/join-code` | New join code (the old link stops working) | same |
| 51 | GET | `/api/admin/organisations/:id/dashboard` | Organisation dashboard (KPIs, learners) | same |
| 52 | GET | `/api/admin/organisations/:id/learners/:userId` | One learner's record | same |
| 53 | POST | `/api/admin/organisations/:id/learners` | Add learners by email | same |
| 54 | DELETE | `/api/admin/organisations/:id/learners/:userId` | Remove a learner from it | same |
| 55 | GET | `/api/admin/organisations/:id/partners` | Partner contacts | same |
| 56 | DELETE | `/api/admin/organisations/:id/partners/:userId` | Remove a partner login (takes access away) | same |
| | | **People: invites and applications** | | |
| 57 | GET | `/api/admin/needs-attention` | Dashboard "needs attention" counts | same |
| 58 | GET | `/api/admin/invites` | Invite codes | same |
| 59 | POST | `/api/admin/invites` | Create an invite code | same |
| 60 | GET | `/api/admin/mentor-applications` | Mentor applications (read only, `?status=`) | same |
| 61 | GET | `/api/admin/stakeholder-applications` | Stakeholder registrations (read only, `?type=`) | same |
| | | **Media library and AI safety reports** | | |
| 62 | GET | `/api/media` | Media library | same |
| 63 | DELETE | `/api/media` | Delete several files | same |
| 64 | DELETE | `/api/media/:id` | Delete a file | same |
| 65 | GET | `/api/admin/ai-reports` | Reported AI answers | same |
| 66 | PATCH | `/api/admin/ai-reports/:id` | Set a report's status | same |
| 67 | POST | `/api/admin/ai-reports/:id/notes` | Add a reviewer note (`{ text }`, append-only, admin-only: reaches no learner) | SMEEP sets `adminNote` on the PATCH |
| | | **Analytics and insights** | | |
| 68 | GET | `/api/admin/stats` | Overview KPI counts | same |
| 69 | GET | `/api/admin/analytics/impact` | Impact dashboard | same |
| 70 | GET | `/api/admin/analytics/learning-gain` | Pre-test vs final exam | same |
| 71 | GET | `/api/admin/analytics/insights` | Insights: KPIs vs previous period, charts (`?range=7d\|30d\|12m`) | same |
| 72 | GET | `/api/admin/analytics/kpi-overview` | KPI overview (`?range=`) | same |
| 73 | GET | `/api/admin/analytics/user-growth` | User growth (`?range=`) | same |
| 74 | GET | `/api/admin/analytics/enrollments` | Monthly enrolments | same |
| 75 | GET | `/api/admin/analytics/course-engagement` | Course engagement | same |
| 76 | GET | `/api/admin/analytics/course-completion` | Completion rates (`?range=`) | same |
| 77 | GET | `/api/admin/analytics/course-performance` | All-time course table | same |
| 78 | GET | `/api/admin/analytics/stakeholder-kpis` | Count per stakeholder type | same |
| 79 | GET | `/api/admin/analytics/stakeholder-trend` | Stakeholder trend (`?range=`) | same |
| 80 | GET | `/api/admin/analytics/stakeholder-trend-by-type` | Stakeholder trend by type (`?range=`) | same |
| | | **AI analytics** (pseudonymised `ai.*` views, SELECT-only, guarded server-side) | | |
| 81 | GET | `/api/admin/ai/catalog` | What can be queried | same |
| 82 | POST | `/api/admin/ai/query` | Run a guarded query | same |
| 83 | GET | `/api/admin/ai/dashboards` | Saved boards | same |
| 84 | GET | `/api/admin/ai/dashboards/:id` | One board | same |
| 85 | POST | `/api/admin/ai/dashboards` | Save a board | same |
| 86 | PUT | `/api/admin/ai/dashboards/:id` | Update a board | same |
| 87 | DELETE | `/api/admin/ai/dashboards/:id` | Delete a board | same |

### SMEEP routes with no Hadafi equivalent (not in the allowlist)

| SMEEP route(s) | Why not here |
| --- | --- |
| `GET /api/lms/learning/admin/learners`, `GET /api/lms/cod/admin/learners`, `GET /api/lms/both/admin/learners`, `GET /api/lms/learning/themes`, `POST /api/lms/learning/admin/learners/:userId/reset-progress`, `…/reset-path`, `…/regenerate-path`, `POST /api/lms/cod/admin/learners/:userId/reset`, `POST /api/lms/both/admin/learners/:userId/reset`, `POST /api/lms/learning/setup/regenerate`, `POST /api/lms/learning/admin/regenerate-all` (11) | Hadafi has no learning journeys / COD paths. |
| `DELETE /api/admin/organisations/:id/invites/:inviteId` | Hadafi partner invites have no pending-invite record or setup token: a partner login is created at once and signs in by an emailed code. Removing it (`DELETE …/partners/:userId`) is the equivalent. |
| `GET/POST /api/admin/competitions`, `GET/PATCH/DELETE /api/admin/competitions/:id`, `GET /api/admin/competitions/:id/applications`, `GET/PATCH /api/admin/competitions/applications/:id` (8) | Hadafi has no competitions. |

Asked about but not available to a key: **newsletter** (Hadafi's only admin
access to subscribers is the bulk export `GET /api/admin/exports/newsletter`,
excluded with the other exports) and **users** (Hadafi has no admin users
endpoint; SMEEP's allowlist has none either).

### Hadafi admin routes deliberately left out

- Bulk exports: `GET /api/admin/exports/:dataset` (learners, course progress,
  learning gain, certificates, redemptions, mentor sessions, newsletter) and
  `GET /api/admin/organisations/:id/exports/:dataset`. Also the AI report
  download `POST /api/admin/ai/report`.
- AI generation `POST /api/admin/quiz/generate`, media upload
  `POST /api/media/upload`, the Zoom host link
  `GET /api/live-events/:id/zoom/start-url` (SMEEP leaves the same kinds
  out). AI-report reviewer notes (`POST /api/admin/ai-reports/:id/notes`) are
  allowed (row 67): the MCP's `adminNote` lands there, and a note is internal
  to admins and reaches no learner.
- `PUT /api/admin/announcements/:id` and `DELETE /api/admin/announcements/:id`
  (edit or delete a draft or scheduled announcement). Hadafi-only: SMEEP has
  no such routes, so the MCP has no tool for them. If the Hadafi adapter needs
  them, add them here; `PUT` can switch an announcement to "send now", so it
  must get `operatorAnnouncementLimit` too.
- **Anything that hands out a login** (CEO decision for SMEEP, Nov 2026,
  applied here), because the key would choose who gets it:
  - `POST /api/admin/organisations/:id/partners` (creates a partner login,
    email already trusted, for any address the caller names; it signs in by
    an emailed code and sees the organisation's learner records),
  - `POST /api/admin/mentor-applications/:id/approve` (creates a mentor login
    for an application anyone can submit on the public site, and emails the
    setup link),
  - `POST /api/admin/mentor-applications/:id/reject` (the other half of the
    same decision).

  A person does these in the admin UI; Maya asks for them in her digest. A key
  can still list partners and mentor applications and remove a partner, which
  only take access away. Do not add these three back when the MCP changes.
- Every learner, mentor, partner and account route.

## Rules the server enforces

- A request that carries `Authorization: Bearer …` on an `/api` app route
  (with keys configured) is decided by the key alone. If the key is valid, the
  request acts as the service account. Otherwise the answer is **401**, even
  if a valid session cookie came with it.
- The answer is also 401 if the service account is missing, or if its role is
  not `admin`. The account is looked up on every request, so a role change
  takes effect immediately.
- The allowlist above applies (403 otherwise). Request targets with dot
  segments, backslashes, `//` or encoded `.` `/` `\` are refused for keys, so
  the allowlist and Express always agree on the route.
- Keys are never accepted on Better Auth routes (`/api/auth/*`) or account
  routes (`/api/account/*`, including the Hana copilot and voice tokens), also
  when the request line is in absolute form (`POST http://host/api/account/…`).
  A key can't set a password on the service account, edit its profile or mint
  tokens for it.
- The service account can't sign in or hold a browser session. Password
  sign-in gets the same status and body as a wrong password, code sign-in the
  same status and body as a wrong code, and code requests the same status and
  body as for an unknown address, without sending anything. (Same status and
  body, not a timing guarantee.) A session cookie for it gets a 401, at once:
  Hadafi reads the users row on every request, so the 5-minute cookie cache
  doesn't delay it.
- That block does not depend on `OPERATOR_SERVICE_USER_EMAIL` alone. It
  applies to the address in that variable **and** to any account named
  "Maya (AI operator)" (the name the create script gives it; case and
  surrounding spaces ignored), so the account still can't sign in if the
  variable is unset. A person who names their own account that way locks
  themselves out; an admin can rename them.
- `Basic` credentials are left alone, so the access gate keeps working (it
  already exempts `/api/`).
- `POST /api/admin/announcements` (banner, bell and email to a whole
  audience) is limited for a key to **3 an hour and 10 a day**, per service
  user (all keys share it), on top of the 30-an-hour limit every admin has.
  Further attempts answer `429` (`RATE_LIMITED`). Every attempt counts,
  including invalid ones. Counters are in memory and reset on deploy.

## What gets audited

One row each, written after the response, never blocking or failing the
request:

- Every `POST`/`PUT`/`PATCH`/`DELETE` to any `/api` route by an admin session
  or an operator key, including failed and refused ones (the status code is
  kept). If the caller hangs up before the response, the row has status `499`;
  it is written as soon as the caller is identified (the change may still go
  through). This holds for every request on the connection, including
  pipelined ones (the hang-up is watched on the connection, since Node never
  attaches queued responses to the socket).
- `GET` requests made with an operator key that download a bulk export: a path
  containing `/export` or `/exports`, or a response sent as an attachment.
  Other `GET`s are not recorded.

Each row holds `actor_user_id`, `actor_kind` (`session` | `operator_key`),
`key_label`, `method`, `path` (normalised: no query string, no host),
`status_code`, `target_ids` (the route params, e.g. `{"id": "…"}`),
`request_summary` and `ip`. `request_summary` is `{ query?, body? }`.
Password (incl. `confirm`, `pwd`, `…Pass`), token, secret, key, OTP, PIN,
`…code`, cookie and authorization fields are replaced with `[redacted]` at any
depth, and so are TOTP, MFA, recovery and backup codes, JWT, bearer, HMAC,
`sig` and signature, private and signing key, CVV, card number and IBAN fields
(field names matched case-insensitively). On `/api/account/*`, `/api/auth/*`,
AI-mentor chat (`/api/ai-mentors/*`), Ask Hana (`/api/ask-hana/*`), the AI
examiner and Anam (`/api/ai/*`) and AI tools (`/api/ai-tools/*`) only the field
names are kept: `{ queryKeys?, bodyKeys? }`. Emails are kept. Long strings,
long arrays and very large bodies are cut short. `actor_user_id` has no
foreign key, so deleting a user keeps the record of what they did.

## Setup: staging first, then production

Deploy the branch first. Migration `0034_admin_audit_log` runs on its own when
the server container starts (`entrypoint.sh` runs `scripts/migrate.mjs`). From
then on, admin changes are audited even before any key exists.

### 1. Generate a key (on your own machine, never on a server)

```sh
cd server
node scripts/generate-operator-key.mjs --label maya-staging-2026-11
```

It prints:

- **The raw key** (`hadafi_op_…`), shown once. Put it straight into Maya's
  secret store (the potential-ai operator's Hadafi credential) and nowhere
  else: not chat, not tickets, not the server.
- **The `label:sha256` entry**, which goes in `OPERATOR_API_KEYS`.

Use a different key per environment (`maya-staging-…`, `maya-prod-…`). The
script refuses to print into a pipe or log file.

### 2. Create the service account (Dokploy terminal, `server` container, `/app`)

```sh
node scripts/create-operator-user.mjs --email maya@potential.org          # preview
node scripts/create-operator-user.mjs --email maya@potential.org --apply
```

The account is created as an admin named "Maya (AI operator)", with no
password and no other way to sign in. Running it again changes nothing. It
refuses to promote an existing non-admin account, to take over an admin who
can sign in (a person), or to adopt an admin it did not create.
`scripts/prod-prep.mjs audit` will count it as one unverified admin
@potential.org; that is expected (it never signs in).

### 3. Set the environment and redeploy

On the `server` service in Dokploy:

```
OPERATOR_SERVICE_USER_EMAIL=maya@potential.org
OPERATOR_API_KEYS=maya-staging-2026-11:<sha256 from step 1>
```

Redeploy (or restart the server) so it reads them.

### 4. Verify

From a machine that has the key (read from a variable, so it stays out of
shell history):

```sh
read -rs HADAFI_OPERATOR_KEY && export HADAFI_OPERATOR_KEY   # paste the key, press Enter
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $HADAFI_OPERATOR_KEY" https://<site>/api/admin/invites            # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer wrong" https://<site>/api/admin/invites                          # 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $HADAFI_OPERATOR_KEY" "https://<site>/api/admin/exports/learners"  # 403
```

The first 200 also proves the site's `/api` rewrite passes the
`Authorization` header through. Then make one harmless change with the key
(e.g. `POST /api/admin/invites`) and check it was recorded:

```sql
select at, actor_kind, key_label, method, path, status_code, target_ids
from admin_audit_log order by at desc limit 20;
```

When staging looks right, repeat steps 1 to 4 on production
(`hadafi.potential.org`) with a **new** production key.

## Rotation (no downtime)

1. Generate a new key with a new label, e.g. `maya-prod-2027-02`.
2. Add its entry next to the old one:
   `OPERATOR_API_KEYS=maya-prod-2026-11:<old>,maya-prod-2027-02:<new>`, redeploy.
3. Switch Maya to the new key. Check `admin_audit_log.key_label` shows it.
4. Remove the old entry and redeploy.

## Revocation

- **One key:** remove its entry from `OPERATOR_API_KEYS` and redeploy.
- **All keys, immediately, without a redeploy:** demote the service account.
  Every key gets a 401 from the next request on:
  ```sql
  update users set role = 'operator-disabled' where email = 'maya@potential.org';
  ```
  Set the role back to `admin` to re-enable it.
- **Turn the feature off:** demote the service account first, then unset
  `OPERATOR_API_KEYS` and redeploy. Keep its name "Maya (AI operator)" so the
  sign-in block still applies with `OPERATOR_SERVICE_USER_EMAIL` unset, or
  delete the account (audit rows keep its id; they have no foreign key).

If a key may have leaked, demote the account first (it's instant), then
rotate, then review `admin_audit_log` for that `key_label`.

## Notes

- A key acts as an admin on the allowlisted routes, which include destructive
  ones (deleting courses, organisations, offers, events). Treat it like an
  admin password that never expires.
- As an admin, the service account receives in-app admin notifications (e.g.
  AI-answer reports); they are never read and do no harm.
- Audit rows are kept indefinitely; there is no retention job yet.
- Failed key attempts are logged as `[operator-keys] refused a Bearer request`
  with a reason. The key itself is never logged.
- There is no admin page for the audit log yet. Read it with SQL.

## Differences from SMEEP

- Allowlist: 87 routes here vs 106 on SMEEP (the 20 SMEEP-only routes above,
  plus one Hadafi-only: `POST …/ai-reports/:id/notes`, because SMEEP sets the
  note with `adminNote` on its PATCH and Hadafi keeps notes append-only).
  `POST …/announcements/:id/archive` is `POST …/announcements/:id/end` here.
- No partner setup links in Hadafi (partners sign in by emailed code), so
  SMEEP's "strip the setup link from responses to a key" change has nothing to
  strip; the partner invite itself is still refused for keys.
- The session check reads the users row (Hadafi already did, for the role), so
  a session of the service account is refused at once rather than after the
  5-minute cookie cache.
- Keys-only audit paths are Hadafi's: Ask Hana, `/api/ai/*` (examiner, Anam)
  and `/api/ai-tools/*` instead of SMEEP's Ask Sana and community.
- Hadafi has no global per-IP `/api` limit (SMEEP: 1200 a minute), so keys are
  only limited by each route's own limits and the announcement limit above.
  The announcement limit is lifted under `NODE_ENV=test` unless
  `HADAFI_RATE_LIMITS=on` (SMEEP: `SMEEP_RATE_LIMITS`).
- Keys start `hadafi_op_` (SMEEP: `smeep_op_`).
