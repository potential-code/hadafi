# Release runbook: the Hadafi revamp

The order of operations for putting `redesign/modern-lms` (the redesign, Better Auth and every feature
since) live on **hadafi.potential.org**, and the data the live site needs before anyone demos it.
Modelled on SMEEP's `docs/release-runbook.md`.

Where things are:

| What | Where |
|---|---|
| Site | Dokploy project **Hadafi**, compose app `hadafi-app-qaja31`, services `client` (3000) and `server` (5000), built from `main` with `./docker-compose.yml`, auto-deploy **off** |
| Domains | `hadafi.potential.org` → `client:3000`; `hadafi.potential.org/api` and `/uploads` → `server:5000` (keep these three as they are) |
| Database | Separate Dokploy Postgres service in the same project (`hadafi-db-…`, Postgres 18, no public port) |
| Live today | `main` (last deploy 4 Nov 2026, `676890c`), migrations up to `0020_points_ledger` |

Commands marked **container** run in the `server` container's terminal in Dokploy, from `/app`. Every
write command in `scripts/prod-prep.mjs` only previews (one transaction, rolled back) unless you add
`--apply`: run it plain first and read what it says. `audit` prints counts only, never a name or email.

---

## 1. Pre-flight (the day before)

1. **potential-ai is ready**: branch `feat/hadafi-platform` (enables platformId `hadafi` on `dataChat`,
   `dashboardBuilder`, `smeepExaminer` and `/api/examiner/grade`, `smeepTutor`, `smeepCourseHelp`,
   `/learning/quiz-generate`, `/learning/translate` for the Arabic and Urdu tutor, with Hana as the
   persona; guest chat limits raised to 120 a minute and 2,000 a day) is reviewed and ready to deploy.
   Review Hana's audience wording in `src/graphs/shared/platformPersona.ts` there.
2. **Email works.** Production sends sign-in codes through AWS SES (`AWS_REGION`, keys, `FROM_EMAIL`, all
   set on the live app today). Send one test email from that SES account to a real inbox. After this
   release everyone signs in with an emailed code at least once: **no email, no sign-in.**
3. **Secrets ready** (values never go in chat or in git):
   - `BETTER_AUTH_SECRET`: `openssl rand -base64 32` (32+ characters).
   - `COPILOT_SERVICE_JWT_SECRET`: already set; it must equal potential-ai's `SERVICE_JWT_SECRET` (or its
     `SERVICE_JWT_SECRET__HADAFI`, if one is configured there).
4. **Rehearsal done** (section 3) on a fresh production dump, with no `!!` left in `audit`.

## 2. Backup (on the day, before anything else)

1. **Database.** Dokploy has no backup schedule for the Hadafi Postgres today. Either add a backup
   destination and run one now (Postgres service → Backups → Run manual backup), or on the Dokploy host:
   ```bash
   docker exec $(docker ps -qf name=hadafi-db) pg_dump -U <db user> -d <db name> -Fc > hadafi-prod-$(date +%F-%H%M).dump
   ```
   Use the Postgres 18 tools inside the container (a local `pg_dump` older than 18 refuses the server).
   Copy the file off the host and check its size is not zero.
2. **Uploads.** The `uploads` volume (certificates, media) is kept across deploys; back it up too:
   `docker run --rm -v <compose project>_uploads:/u -v $PWD:/b alpine tar czf /b/hadafi-uploads-$(date +%F).tgz -C /u .`
3. **Code.** Keep the current `main` where it can be redeployed:
   ```bash
   git fetch origin
   git branch backup/main-pre-revamp origin/main && git push origin backup/main-pre-revamp
   git tag live-pre-revamp-2026-11 origin/main && git push origin live-pre-revamp-2026-11
   ```

## 3. Rehearsal on a production dump (local only)

Mamoon provides the dump (section 2). It stays on his machine, is never committed or uploaded, and is
deleted afterwards. Report counts only.

```bash
# Postgres 18, like production, on a local port
docker run -d --name hadafi-rehearsal-db -e POSTGRES_PASSWORD=rehearsal -p 55432:5432 postgres:18
docker exec -i hadafi-rehearsal-db createdb -U postgres hadafi
docker exec -i hadafi-rehearsal-db pg_restore -U postgres -d hadafi --no-owner --no-acl < hadafi-prod-….dump

# Before the new code: what will happen (counts, pending migrations, collisions)
cd server && DATABASE_URL=postgres://postgres:rehearsal@localhost:55432/hadafi node scripts/prod-prep.mjs audit

# The real images, built from the release commit
docker network create hadafi-rehearsal
docker network connect hadafi-rehearsal hadafi-rehearsal-db
docker build -f server/Dockerfile -t hadafi-server:release .
docker build -f client/Dockerfile --build-arg API_INTERNAL_URL=http://hadafi-api:5000 \
  --build-arg NEXT_PUBLIC_AI_BACKEND_URL=https://agents.potential.com -t hadafi-client:release .
docker run -d --name hadafi-rehearsal-api --network hadafi-rehearsal --network-alias hadafi-api \
  --env-file rehearsal.env -e DATABASE_URL=postgres://postgres:rehearsal@hadafi-rehearsal-db:5432/hadafi \
  -e REMINDER_EMAILS_ENABLED=false -e ANNOUNCEMENT_EMAILS_ENABLED=false -e REMINDERS_ENABLED=false \
  -e ANNOUNCEMENTS_TIMER_ENABLED=false hadafi-server:release
docker logs -f hadafi-rehearsal-api      # "Migrations complete", then "Server listening"
docker run -d --name hadafi-rehearsal-web --network hadafi-rehearsal -p 3300:3000 hadafi-client:release
```

`rehearsal.env` holds non-production values (a fresh `BETTER_AUTH_SECRET`, `FRONTEND_URL` and
`BETTER_AUTH_URL` = `http://localhost:3300`, `NODE_ENV=production`, no AWS keys). The timers are off
so nothing is sent to real people from the copy.

Check, and write down the numbers:
- the log shows `Migrations complete` (0021 to the last one) and how long it took;
- `docker exec hadafi-rehearsal-api node scripts/prod-prep.mjs audit`: no pending migrations, account
  counts by role, legacy accounts, unverified staff by domain, events flagged "time to check",
  certificates to redraw (0 a minute after start), points ledger all consistent;
- `node scripts/prod-prep.mjs certificate-check` and the dry runs of `set-admins`, `retire-default-admin`
  and `verify-accounts` from section 6;
- `http://localhost:3300/` and `/login` load; `/api/health` answers `{"status":"ok"}`.

Then `docker rm -f hadafi-rehearsal-web hadafi-rehearsal-api hadafi-rehearsal-db` and delete the dump.

## 4. Environment in Dokploy (names only; values from Mamoon)

Set these on the compose app (Environment tab) **before** deploying. Already set on the live app:
`DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `FROM_EMAIL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`COPILOT_SERVICE_JWT_SECRET`, `NEXT_PUBLIC_AI_BACKEND_URL`, `NEXT_PUBLIC_API_URL`, `PORT`.

**Add now:**

| Variable | Value |
|---|---|
| `BETTER_AUTH_SECRET` | The new 32+ character secret. Signs session cookies and announcement unsubscribe links. Without it sessions fall back to `JWT_SECRET` and unsubscribe links fail in production |
| `BETTER_AUTH_URL` | `https://hadafi.potential.org` (defaults to `FRONTEND_URL`, so optional if that is the same) |
| `FROM_NAME` | `Hadafi` (the default) |
| `REMINDER_EMAILS_ENABLED` | `false` (the default; learner emails wait for client sign-off) |
| `ANNOUNCEMENT_EMAILS_ENABLED` | `false` (the default) |

**Optional, add when ready:**

| Variable | When |
|---|---|
| `AI_READONLY_DATABASE_URL` | After section 6 step 5 prints it. Until then AI Insights and AI Dashboard say they aren't set up |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_HOST_USER_ID`, `ZOOM_WEBHOOK_SECRET_TOKEN` | Zoom meetings for events. Without them admins choose "Other link" or "In person". Webhook URL: `https://hadafi.potential.org/api/webhooks/zoom` (`meeting.started`, `meeting.ended`) |
| `ANAM_API_KEY`, `ANAM_AVATAR_ID`, `ANAM_VOICE_ID` (`ANAM_API_URL` only to override Anam's default) | AI Examiner video mode. Without them the examiner offers text and voice |
| `SERVER_PUBLIC_URL` | `https://hadafi.potential.org`, for absolute upload URLs |
| `CRM_SYNC_ENABLED`, `CRM_INTAKE_URL`, `POTENTIAL_CRM_INTAKE_KEY`, `CRM_PROGRAM_ID`, `CRM_COHORT_ID` | Learner events to the Potential CRM (section 10). Unset = events queue, nothing is sent |
| `TRUSTED_PROXIES`, `TRUST_PROXY_HOPS` | Leave unset (Traefik is a private hop). `TRUST_PROXY_HOPS` only behind a CDN |
| `REMINDERS_ENABLED`, `ANNOUNCEMENTS_TIMER_ENABLED` | Leave unset (timers on). `false` stops one, e.g. on a second API container |
| `AI_MENTOR_API_URL`, `LOG_LEVEL` | Leave unset (`https://api.potential.com`, `info`) |
| `API_INTERNAL_URL` | Leave unset: compose uses `http://hadafi-api:5000`, an alias only this deployment's API has |
| `NEXT_PUBLIC_API_URL` | May be removed: when empty the homepage calls its own `/api`. Keep it if it is `https://hadafi.potential.org` |

## 5. Deploy

1. **potential-ai first.** Deploy the API and the LangGraph service from `feat/hadafi-platform` (merged to
   its `main` if that is how it is released), with `STRICT_TOKEN_PLATFORMS` left as it is (do **not** add
   `hadafi` yet). Check SMEEP's Ask Sana still answers.
2. **Merge Hadafi.** `redesign/modern-lms` into `main` (the backup branch and tag from section 2 exist).
3. **Deploy Hadafi** in Dokploy (auto-deploy is off: click Deploy). The server runs every pending
   migration on start (`0021_redesign_features` to the last one; the rehearsal says how long) before it
   listens; the client waits for the server's health check. Everyone is signed out once and signs back
   in with an email code (old passwords still work after that first code).
4. **Check it is the new build**, not the old one still running:
   ```bash
   curl -s https://hadafi.potential.org/api/auth/ok        # new build: {"ok":true}; old build: 404
   ```
   and in the Dokploy server log: `Migrations complete`, then `Server listening`.

## 6. Data prep (container, in this order)

```bash
node scripts/prod-prep.mjs audit
```

Read it top to bottom (no `!!` under Migrations; settings section shows nothing `MISSING`), then:

1. **Real admins.** Created verified, with no password: they sign in with an email code and can set a
   password in Profile. Safe to re-run.
   ```bash
   node scripts/prod-prep.mjs set-admins mamoon@potential.com rawzaba@potential.com keenan@potential.com aliya@potential.com jay@potential.com
   node scripts/prod-prep.mjs set-admins mamoon@potential.com rawzaba@potential.com keenan@potential.com aliya@potential.com jay@potential.com --apply
   ```
   **Sign in as one of them now** (email code) and open the admin dashboard before step 2.
2. **Retire the default `admin@email.com`.** As on SMEEP it is deleted (its password and sessions go
   with it), after what it created (media library, events, invite codes, announcements, AI dashboards,
   AI safety notes) is handed to the first verified real admin. It refuses while it is the only
   verified admin.
   ```bash
   node scripts/prod-prep.mjs retire-default-admin
   node scripts/prod-prep.mjs retire-default-admin --apply
   ```
3. **Staff who can't receive a code.** `audit` lists unverified staff by email domain. If a domain is not
   a mailbox its owners read (imported mentors), mark those accounts verified so they keep signing in
   with their password:
   ```bash
   node scripts/prod-prep.mjs verify-accounts --domain <domain>
   node scripts/prod-prep.mjs verify-accounts --domain <domain> --apply
   ```
   Single accounts: `verify-accounts a@x.com b@y.com`.
4. **Certificates.** `audit` shows how many certificates are still drawn with the old template; the
   server redraws them in the background after start, so it should be 0 a minute later. Then:
   ```bash
   node scripts/prod-prep.mjs certificate-check
   ```
   It lists, by certificate number, course and date only, certificates that miss today's issuing rules.
   Older ones may predate the rules: check by hand before treating any as misuse.
5. **AI read-only role** (AI Insights and AI Dashboard). After the new server has started once (migration
   `0029_ai_views` builds the `ai` views):
   ```bash
   node scripts/prod-prep.mjs ai-readonly-role
   node scripts/prod-prep.mjs ai-readonly-role --apply      # prints AI_READONLY_DATABASE_URL once
   ```
   Set `AI_READONLY_DATABASE_URL` in Dokploy, **redeploy**, then:
   ```bash
   node scripts/prod-prep.mjs ai-readonly-check              # must read the ai views and be refused everything else
   ```
   Lost the URL? `ai-readonly-role --new-password --apply`. If the database user can't create roles,
   run `scripts/ai-readonly-role.sql` by hand (see `docs/ai-analytics.md`).
6. **Events.** If `audit` shows upcoming events marked "time to check" (migration 0025 couldn't read
   their old free-text time and put them at noon UAE time), open each in **Admin > Events** and confirm
   the date and time. Add at least one real upcoming event before the demo.

## 7. Post-deploy checks (about 10 minutes)

- `https://hadafi.potential.org/api/auth/ok` returns `{"ok":true}` (only the new build has it).
- Homepage loads with images and live counts; **Sign in** with an email code (SES delivered it).
- Learner: dashboard, a course lesson, Ask Hana replies as Hana, Multi Learning, AI Examiner.
- Sign up a fresh learner (code arrives, lands on the dashboard).
- Admin: dashboard, Announcements (email is offered only once switched on), Events, AI safety,
  Organisations, AI Insights ("learners by country") once the read-only role is set.
- Mentor: sign in, Availability saves a slot.
- Open one certificate image itself.
- Sign out; the dashboard sends you to sign in.
- `node scripts/prod-prep.mjs audit` once more: no `!!`.

## 8. Rollback

The migrations are additive except two details, so the previous image still runs on the migrated
database:

- `0025_event_times` makes `live_events.starts_at`/`ends_at` required: on the old build, **creating** an
  event fails (showing and editing existing ones work).
- Accounts created or passwords changed on the new build live in `auth_accounts`; the old build reads
  `users.password_hash`, so those people can't sign in on the old build.

So:

- **Within the first hour, nothing important written:** redeploy the old code (point the Dokploy branch at
  `backup/main-pre-revamp`, or reset `main` to the `live-pre-revamp-2026-11` tag) **and** restore the
  section 2 dump:
  ```bash
  docker exec -i $(docker ps -qf name=hadafi-db) pg_restore -U <db user> -d <db name> --clean --if-exists --no-owner < hadafi-prod-….dump
  ```
- **Later:** redeploy the old code without restoring (people sign in the old way; new accounts and new
  events wait), fix forward, and redeploy the release.
- potential-ai: Hadafi's new agents are additive; roll it back only if SMEEP breaks.

## 9. Later steps

1. **Strict tokens, at least an hour after the Hadafi deploy** (browsers cache a chat token for up to an
   hour): set `STRICT_TOKEN_PLATFORMS=smeep,hadafi` on potential-ai (keep every platform already listed)
   and restart it. Check Ask Hana and the sign-up chat answer as Hana and the potential-ai log has no
   `[tokenScope] system prompt not listed` lines after normal use. If anything breaks, take `hadafi` out
   and restart.
2. **Learner emails, after the client signs off** on what goes out: `REMINDER_EMAILS_ENABLED=true`
   (session and event reminders, event booking emails) and/or `ANNOUNCEMENT_EMAILS_ENABLED=true` (email
   announcements), then redeploy. Every announcement email has a one-click unsubscribe.
3. Add a Dokploy backup schedule for the Hadafi Postgres; rotate any secret that was ever pasted in chat;
   remove test accounts in Admin > Users.

## 10. Consent and CRM sync (ported from SMEEP)

- **Migration 0033** adds four nullable/defaulted columns to `users`
  (`terms_accepted_at`, `marketing_opt_in` default false, `marketing_opt_in_at`,
  `marketing_consent_text`) and creates `crm_outbox`. It only adds things;
  existing learners keep `marketing_opt_in = false` and no terms date.
- **Sign-up now requires the Terms tick** on both paths (form and Hana's chat):
  the API answers 400 `TERMS_REQUIRED` without it. The optional marketing box is
  unticked by default; its wording is stored from the server's copy
  (`shared/marketingConsent.ts`). Learners can change it later on their profile
  (Profile > Emails; `PUT /api/me/announcements/email-preference { marketing }`).
  Every event carries the learner's consent when it was queued: an opt-in
  always with `marketingConsentText` and `marketingConsentAt`; a withdrawal as
  `marketingOptIn: false` with `marketingConsentAt` = when it was turned off.
  A change also queues its own consent_changed event, so a withdrawal reaches
  the CRM promptly.
- **Events queue from day one** in `crm_outbox` (keys `hadafi:reg:`, `hadafi:act1:`,
  `hadafi:cert:`, `hadafi:consent:`): registration, first activation and course
  completed (once each), and consent_changed for each real change of the
  marketing setting. Synced learners are those who signed up with the consent
  step, plus existing learners who opt in on their profile (that queues their
  registration, dated to their original sign-up). Existing learners who never
  opt in are never sent; there is no backfill. A certificate whose image can't
  be drawn is taken back, and its unsent course_completed event with it.
- **Consent is fresh when sent:** the first send of any event refreshes its
  consent fields from the learner's current row (an event can wait while sync
  is off) and saves them, so retries send the same bytes.
- **Sending is off** until `CRM_SYNC_ENABLED=true` with `CRM_INTAKE_URL` (https),
  `POTENTIAL_CRM_INTAKE_KEY` and `CRM_PROGRAM_ID` set (`CRM_COHORT_ID`
  optional; both must be UUIDs, or nothing is sent and one warning is logged).
  Hadafi needs its own program id in the CRM. Names and course names are cut
  to the CRM's 300 characters. The drain runs every 30 seconds, at most 25
  events a run, with retries (1 minute doubling to 6 hours, 20 tries). Rows
  queued before the program id was set get it on their first send.
- **Deploy the site and the API together.** A sign-up page loaded before this
  release sends no Terms tick and gets `TERMS_REQUIRED`; the API's message tells
  the person to refresh the page (the old form shows its generic error; the old
  chat passes the message on).
- **Rate cap is per API process:** 25 events every 30 seconds each, so one
  replica stays at 50 a minute against the CRM's 120. SMEEP sends to the same
  CRM on its own budget.
- **401/403/404 from the CRM** are treated as a wrong URL or key: nothing is
  marked failed, the run stops, one warning is logged until the config changes.
- **Logs and `last_error`** hold event keys, HTTP status and the CRM's error
  code only, never names, emails or response text.
- **Health:** `node scripts/crm-outbox-status.mjs` in the server container
  (locally: `node --env-file=../.env scripts/crm-outbox-status.mjs` from
  `server/`) prints pending / sent / failed counts (read-only). Each run that
  sends something logs "CRM sync run" with the same counts.

## 11. Google Tag Manager and the cookie banner (ported from SMEEP)

- **Off until configured.** `GTM_CONTAINER_ID` on the **client** service
  (compose passes it through; default empty). Empty, unset or not a
  `GTM-XXXX` id (`^GTM-[A-Z0-9]{4,10}$`) means no GTM script, no banner and no
  "Cookie settings" link: the site is exactly as before. That is the kill switch.
- **Run time, not build time.** The browser reads it from `GET /public-config`
  (a Next route, `no-store`), so changing it in Dokploy needs a redeploy/restart
  of the client container, not a code change. Potential.org's "Main" container
  is `GTM-54W3N48W`; locally use a dummy such as `GTM-TEST1234`.
- **Old containers are refused.** Hadafi's old `GTM-5C9G6FPK` (and SMEEP's
  `GTM-NGQNTZJ`, AI Amplify's `GTM-PCDGSJLR`) count as unset in `validGtmId`
  (`client/lib/consent/gtmId.ts`). Set only the Main id.
- **Consent Mode v2, default denied.** Before the GTM script is added the page
  sets `ad_storage`, `analytics_storage`, `ad_user_data` and
  `ad_personalization` to denied (`wait_for_update: 500`) and
  `ads_data_redaction`. A returning visitor's Accept is re-applied before GTM
  loads. Accept grants all four; Reject keeps them denied.
- **Cookieless pings ("advanced" Consent Mode).** With GTM loaded and consent
  denied, Google tags can still send cookieless pings. For **zero** requests
  before Accept, set **"Require additional consent for tag to fire"**
  (ad_storage / analytics_storage) on every Google tag in the container; the
  site needs no change for that.
- **Reject removes this site's cookies only:** `_ga*`, `_gid`, `_gat*`,
  `_gcl_*`, host-only or set for `hadafi.potential.org` exactly, never the
  parent `.potential.org` (other Potential.org sites share it and keep their
  own consent). So Reject can delete them, set `cookie_domain` to
  `hadafi.potential.org` (not `auto`) in the Google tag / GA4 configuration and
  the Conversion Linker for this host.
- **Pages GTM runs on: an allowlist** (`isTrackedUrl` in
  `client/lib/consent/gtm.ts`). Only `/`, `/login`, `/sign-up` and
  `/dashboard/**`, minus payment pages (`/dashboard/offers/<id>/checkout`, the
  Stripe card form; also any `billing`, `payment(s)`, `invoice(s)` page), and
  only when every query parameter is known to be harmless: `utm_*`, ad click
  ids (`gclid`, `gbraid`, `wbraid`, ...), `expired` (/login), `mentor`
  (/dashboard/human-mentors, a mentor id) and `success` (/dashboard/offers).
  No value of any parameter may look like an email address (decoded and
  NFKC-normalised, so `%40`, `%2540` and a full-width `＠` count). `utm_*` are
  free text (Sendy campaign titles, Google Ads `{keyword}`), empty allowed,
  up to 200 characters; `utm_term` also may not hold 7+ digits in a row once
  separators are removed (a phone number). `gtm_debug=x` (or a timestamp) is
  allowed so GTM Preview / Tag Assistant can connect. `next` (where to go
  after signing in) is allowed on `/login` and `/sign-up` only, and only when
  it is a safe return path that is itself a tracked learner page (an emailed
  course link); pointing at a staff area or a checkout it untracks the page.
  Hadafi has no partner `?ref=` links, so `ref` is untracked.
  Never tracked: `/mentor/setup?token=` (mentor setup link),
  `/unsubscribe?token=` (announcement emails), `/sign-up?code=` / `?org=`
  (invite and organisation codes), `/dashboard/courses?q=` (free-text search),
  any `?token=`/`?key=`/`?secret=` or other unknown parameter, fragments with
  values, the staff areas (`/admin`, `/mentor`, `/partner`), the 404 page and
  any page not on the list. **When you add a page, it is untracked until you
  add it there; never add a page whose URL can carry a token, code or key.**
- **GTM starts only in a clean document.** If the current document has shown
  an untracked URL (e.g. `/sign-up?code=…` then a client-side move to
  `/login`), or the Navigation API lists one among this document's history
  entries, GTM does not start for the life of that document. The next full
  page load on a tracked URL starts fresh. So visitors arriving through an
  invite, organisation or token link are not tracked for that visit (and their
  sign-up sends no `sign_up` event).
- **Referrer-Policy: `strict-origin`** on every page (next.config.ts), so a
  token or invite URL never shows up in `document.referrer` or another site's
  logs; only `https://hadafi.potential.org` is sent. The API keeps helmet's
  `no-referrer`.
- **Leaving tracked pages.** GTM is loaded with a history guard: a client-side
  push to an untracked URL becomes `location.assign`, a replace becomes
  `location.replace`, and Back/Forward or a fragment change onto an untracked
  URL reloads before GTM's listeners run. Redirects after sign-in (form and
  Hana's chat), sign-up, mentor setup and RequireAuth's role redirect use
  `goTo()` (full load into staff areas while GTM runs; client-side as before
  while GTM is off).
- **Banner and link.** Choice in `localStorage["hadafi.cookieConsent"]` =
  `{ choice, version, date }`; asked again after 12 months, or when
  `CONSENT_VERSION` in `client/lib/consent/consentStorage.ts` goes up. "Cookie
  settings" (home footer, under the sign-in and sign-up forms, learner
  sidebar, learner Support > Policies) reopens it; focus returns to the link
  after the choice. Neither shows on untracked pages. The banner sits above
  the learner phone tab bar and below menus and dialogs; it uses logical
  (start/end) placement.
- **Events.** Pushed only while GTM runs on a tracked page. Only these exact
  objects, never a name, email, phone, country, course name or id:
  | Event | When | Where |
  |---|---|---|
  | `{ event: 'sign_up_start', method: 'web_form' }` | first focus/typing in the sign-up form, once per page | `client/views/SignUp.tsx` (`startWebForm`) |
  | `{ event: 'sign_up_start', method: 'hana_chat' }` | Hana's "I want to register" on the homepage, once per page | `LandingRegistrationChat.tsx` (`handleRegisterClick`) |
  | `{ event: 'sign_up', method: 'web_form' \| 'hana_chat' }` | account created | `client/lib/createAccount.ts` |
  | `{ event: 'first_lesson_completed' }` | the server's one-time `badge:first_step` notification (first learning step) | `NotificationBell.tsx` -> `consentStore.noteNotifications` |
  | `{ event: 'course_certificate' }` | the server's one-time `certificate:<id>` notification (certificate issued) | same |
  | `{ event: 'consent_update', consent: 'granted' }` | the visitor clicks Accept (first choice, or from Rejected via Cookie settings), right after the consent update; once per page; never for an Accept restored at page load, never on Reject | `client/lib/consent/store.ts` (`accept`) |

  Hadafi's bell normally polls only the unread count; **in the learner shell,
  while GTM actually runs on a tracked page, it polls the list**
  (`GET /api/me/notifications`, 30 items) once a minute and on return to the
  tab, so the event can arrive up to about a minute later. A notification
  counts as new if the server created it in the last 10 minutes and it wasn't
  in this page's earlier fetches for the same signed-in user; once its event
  is pushed, its id is kept in `localStorage["hadafi.gtmReported"]` so other
  tabs and later pages don't report it again. In a document where GTM never
  started (one that showed an invite-code or token URL first) nothing is
  consumed, and the next page load where GTM runs reports it if it is still
  recent. Signing out is a full page load, so a second account in the same tab
  starts from a clean page. In GTM, trigger Ads/GA4 conversions on these names.
  **`consent_update`:** tags blocked at page view (consent still denied) don't
  fire again by themselves when the visitor accepts on that page. In GTM, add a
  Custom Event trigger `consent_update` to the GA4 config/Google tag and the
  Ads remarketing/conversion-linker tags (alongside their page-view
  triggers), so the landing page (e.g. a campaign link) is measured once
  consent is given. (Same trigger as SMEEP's: the container is shared.)
- **CSP:** the only Content-Security-Policy is `frame-ancestors 'self'`, which
  doesn't restrict scripts, so nothing changed. If a script/connect CSP is
  added later, allow `www.googletagmanager.com`, `*.google-analytics.com`,
  `*.analytics.google.com`, `googleads.g.doubleclick.net`, `www.google.com`
  and `*.googlesyndication.com`.
- **Check after setting it:** in a private window the banner shows; in
  DevTools `dataLayer[0]` is the consent default; Reject leaves no `_ga`/`_gcl`
  cookies for this host; Accept adds a `consent update` with all four granted;
  `/unsubscribe?token=x` and `/mentor/setup?token=x` have no
  `googletagmanager` script. In Tag Assistant, sign in as an admin from
  `/login`: the move to `/admin/...` must be a new page load with no GTM, and
  no History Change or page_view may carry an `/admin` URL (same for a learner
  opening an offer's checkout).
