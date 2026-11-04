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
   `/learning/quiz-generate`, with Hana as the persona) is reviewed and ready to deploy.
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
