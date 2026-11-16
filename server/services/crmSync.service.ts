import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { crmOutbox, users } from "../db/schema";
import { logger } from "../config/logger";
import { MARKETING_CONSENT_TEXT } from "../../shared/marketingConsent";

export { MARKETING_CONSENT_TEXT };

/**
 * Learner events for the Potential CRM, through an outbox.
 *
 * Events are queued in crm_outbox; the event key is unique (queueing twice is
 * a no-op) and doubles as the CRM's submissionId:
 *   registration      hadafi:reg:<userId>                in the sign-up transaction
 *   first_activation  hadafi:act1:<userId>               when the first_step badge is first earned
 *   course_completed  hadafi:cert:<userId>:<courseId>    with the course certificate
 *   consent_changed   hadafi:consent:<userId>:<epochMs>  when the learner changes marketing consent
 *
 * Who is synced: learners who signed up with the consent step
 * (users.terms_accepted_at set), and learners from before it who later opt in
 * to marketing on their profile (that queues their registration, dated to
 * their original sign-up). Other existing learners are never sent.
 *
 * Each payload is frozen once it has been sent: the first send fills in the
 * program id if it was missing and refreshes the consent fields from the
 * learner's current row, and saves that, so retries are byte-identical.
 * Queueing never breaks sign-up, learning or settings: failures are logged by
 * event key only (no names or emails).
 *
 * A timer drains the outbox (startCrmSync): due rows are claimed with
 * FOR UPDATE SKIP LOCKED and a lease, so two API processes never send the same
 * row at once, and POSTed to CRM_INTAKE_URL. Nothing is sent unless
 * CRM_SYNC_ENABLED=true; events keep queueing either way. The rate cap
 * (BATCH_SIZE per INTERVAL_MS) is per API process.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** The database or an open transaction; `.transaction()` on a transaction is a savepoint. */
type Executor = typeof db | Tx;
type Env = Record<string, string | undefined>;

export type CrmEventType = "registration" | "first_activation" | "course_completed" | "consent_changed";

/** Give up on a row after this many failed tries (it stays, with last_error). */
export const MAX_ATTEMPTS = 20;
const INTERVAL_MS = 30_000;
/** Rows per run. One run every 30 s is at most 50 a minute per API process, well under the CRM's 120. */
const BATCH_SIZE = 25;
const REQUEST_TIMEOUT_MS = 10_000;
/** A claimed row is skipped by other drains for this long; longer than a whole run can take. */
const LEASE_MS = 10 * 60_000;
const FIRST_RETRY_MS = 60_000;
const MAX_RETRY_MS = 6 * 3600_000;

export const crmEventKey = {
  registration: (userId: string) => `hadafi:reg:${userId}`,
  firstActivation: (userId: string) => `hadafi:act1:${userId}`,
  courseCompleted: (userId: string, courseId: string) => `hadafi:cert:${userId}:${courseId}`,
  consentChanged: (userId: string, at: Date) => `hadafi:consent:${userId}:${at.getTime()}`,
};

interface Learner {
  id: string;
  fullName: string;
  email: string;
  country: string | null;
  marketingOptIn: boolean;
  marketingOptInAt: Date | null;
  marketingConsentText: string | null;
}

interface EventInfo {
  type: CrmEventType;
  occurredAt: Date;
  courseId?: string;
  courseName?: string;
}

const CONSENT_KEYS = ["marketingOptIn", "marketingConsentText", "marketingConsentAt"] as const;

/** The CRM's limit for names (fullName, courseName): longer values are refused, so they are cut here. */
export const CRM_TEXT_MAX = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Trimmed and cut to `max` UTF-16 units (the CRM's measure), never leaving half a surrogate pair. */
function clip(value: string, max = CRM_TEXT_MAX): string {
  let out = value.trim().slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (out.length === max && last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out.trim();
}

/** CRM_PROGRAM_ID / CRM_COHORT_ID from the env, only when they are UUIDs (the CRM refuses anything else). */
function routingIds(env: Env): { programId: string | null; cohortId: string | undefined } {
  const programId = env["CRM_PROGRAM_ID"]?.trim();
  const cohortId = env["CRM_COHORT_ID"]?.trim();
  return { programId: isUuid(programId) ? programId : null, cohortId: isUuid(cohortId) ? cohortId : undefined };
}

/**
 * The consent part of an event. Opted in: always the wording and when (the
 * CRM rejects an opt-in without them). Opted out after opting in: false with
 * the withdrawal time. Never opted in: false alone.
 */
function consentFields(learner: Pick<Learner, "marketingOptIn" | "marketingOptInAt" | "marketingConsentText">, fallbackAt: Date) {
  const optedIn = learner.marketingOptIn;
  return {
    marketingOptIn: optedIn,
    ...(optedIn ? { marketingConsentText: learner.marketingConsentText ?? MARKETING_CONSENT_TEXT } : {}),
    ...(optedIn || learner.marketingOptInAt
      ? { marketingConsentAt: (learner.marketingOptInAt ?? fallbackAt).toISOString() }
      : {}),
  };
}

/** The CRM intake body. The contract is shared with the CRM: don't add fields (no phone, company or newsletter). */
export function buildCrmPayload(eventKey: string, learner: Learner, event: EventInfo, env: Env = process.env): Record<string, unknown> {
  const { programId, cohortId } = routingIds(env);
  return {
    intakeType: "b2c",
    email: learner.email,
    fullName: clip(learner.fullName),
    programId,
    ...(cohortId ? { cohortId } : {}),
    submissionId: eventKey,
    fields: learner.country ? { country: learner.country } : {},
    event: {
      type: event.type,
      occurredAt: event.occurredAt.toISOString(),
      ...(event.courseId ? { courseId: event.courseId } : {}),
      ...(event.courseName ? { courseName: clip(event.courseName) } : {}),
      ...consentFields(learner, event.occurredAt),
    },
  };
}

// ── Safe error details (no SQL params, no CRM response text) ────────────────

/** A database error as SQLSTATE + constraint only: drizzle's message carries the query params (names, emails). */
function dbError(err: unknown): { name: string; code?: string; constraint?: string } {
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === "object"; i++) {
    const { code, constraint } = e as { code?: unknown; constraint?: unknown };
    if (typeof code === "string") {
      return { name: (err as Error)?.name ?? "Error", code, ...(typeof constraint === "string" ? { constraint } : {}) };
    }
    e = (e as { cause?: unknown }).cause;
  }
  return { name: err instanceof Error ? err.name : "Error" };
}

const SAFE_CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/** The CRM's machine error code from a response, if it has one; never its message text. */
async function crmErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { code?: unknown; error?: unknown };
    const nested = body.error && typeof body.error === "object" ? (body.error as { code?: unknown }).code : undefined;
    const candidate = [body.code, nested, body.error].find((c): c is string => typeof c === "string" && SAFE_CODE.test(c));
    return candidate;
  } catch {
    return undefined;
  }
}

/** "network TypeError ECONNREFUSED" style: the error class and system code, no message. */
function networkError(err: unknown): string {
  const name = err instanceof Error ? err.name : "Error";
  const cause = (err as { cause?: { code?: unknown } })?.cause;
  const code = typeof cause?.code === "string" && SAFE_CODE.test(cause.code) ? ` ${cause.code}` : "";
  return `network ${name}${code}`;
}

// ── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Inserts one outbox row in a savepoint (or its own transaction): a failure
 * is logged and swallowed, and never aborts the caller's transaction.
 */
async function insertEvent(exec: Executor, row: { eventKey: string; userId: string; payload: Record<string, unknown> }): Promise<void> {
  try {
    await exec.transaction(async (sp) => {
      await sp.insert(crmOutbox).values(row).onConflictDoNothing({ target: crmOutbox.eventKey });
    });
  } catch (err) {
    logger.error({ eventKey: row.eventKey, error: dbError(err) }, "CRM sync: could not queue an event (carrying on)");
  }
}

/**
 * Queues the registration event inside the sign-up transaction, in a
 * savepoint: the event commits with the account or not at all, and if the
 * insert itself fails only the savepoint is rolled back, so the sign-up still
 * succeeds. Inserting after the commit instead could lose the event if the
 * process stopped in between. `occurredAt` is the sign-up time.
 */
export async function enqueueRegistration(tx: Tx, learner: Learner, occurredAt: Date): Promise<void> {
  const eventKey = crmEventKey.registration(learner.id);
  await insertEvent(tx, { eventKey, userId: learner.id, payload: buildCrmPayload(eventKey, learner, { type: "registration", occurredAt }) });
}

const learnerColumns = {
  id: users.id,
  role: users.role,
  fullName: users.fullName,
  email: users.email,
  country: users.country,
  createdAt: users.createdAt,
  termsAcceptedAt: users.termsAcceptedAt,
  marketingOptIn: users.marketingOptIn,
  marketingOptInAt: users.marketingOptInAt,
  marketingConsentText: users.marketingConsentText,
};

/** In the CRM: signed up with the consent step, or entered it later by opting in (has a registration event). */
async function isSynced(exec: Executor, u: { id: string; role: string; termsAcceptedAt: Date | null }): Promise<boolean> {
  if (u.role !== "sme") return false;
  if (u.termsAcceptedAt) return true;
  const [reg] = await exec
    .select({ id: crmOutbox.id })
    .from(crmOutbox)
    .where(eq(crmOutbox.eventKey, crmEventKey.registration(u.id)))
    .limit(1);
  return Boolean(reg);
}

/** Queues an event for a synced learner, with their current details and consent. Never throws. */
async function enqueueForLearner(exec: Executor, userId: string, eventKey: string, event: EventInfo): Promise<void> {
  try {
    const [u] = await exec.select(learnerColumns).from(users).where(eq(users.id, userId));
    if (!u || !(await isSynced(exec, u))) return;
    await insertEvent(exec, { eventKey, userId, payload: buildCrmPayload(eventKey, u, event) });
  } catch (err) {
    logger.error({ eventKey, error: dbError(err) }, "CRM sync: could not queue an event (carrying on)");
  }
}

/** The learner earned first_step for the first time. */
export function enqueueFirstActivation(userId: string, occurredAt = new Date()): Promise<void> {
  return enqueueForLearner(db, userId, crmEventKey.firstActivation(userId), { type: "first_activation", occurredAt });
}

/** A course certificate was issued to the learner; pass the certificate's transaction. */
export function enqueueCourseCompleted(
  exec: Executor,
  userId: string,
  course: { id: string; title: string },
  occurredAt = new Date(),
): Promise<void> {
  return enqueueForLearner(exec, userId, crmEventKey.courseCompleted(userId, course.id), {
    type: "course_completed",
    occurredAt,
    courseId: course.id,
    courseName: course.title,
  });
}

/**
 * The certificate was taken back before it was drawn (certificate.service):
 * drops its course_completed event too, if it hasn't been sent, so the CRM
 * never hears of a completion without a certificate. Issuing it again later
 * queues the event again. Pass the transaction that deletes the certificate.
 */
export async function withdrawCourseCompleted(exec: Executor, userId: string, courseId: string): Promise<void> {
  const eventKey = crmEventKey.courseCompleted(userId, courseId);
  try {
    await exec.transaction(async (sp) => {
      await sp.delete(crmOutbox).where(and(eq(crmOutbox.eventKey, eventKey), isNull(crmOutbox.sentAt)));
    });
  } catch (err) {
    logger.error({ eventKey, error: dbError(err) }, "CRM sync: could not withdraw an event (carrying on)");
  }
}

/**
 * Sets a learner's marketing consent from their profile and queues what the
 * CRM needs to know, in one transaction. A real change only: setting the value
 * it already has does nothing (so "off" for someone who never opted in records
 * no withdrawal). marketing_opt_in_at becomes the time of the change.
 *
 * Synced learners get a consent_changed event. An existing learner (from
 * before the consent step) who opts in enters the CRM: their registration is
 * queued too, dated to their original sign-up.
 *
 * @returns false if the user is not a learner.
 */
export async function changeMarketingConsent(userId: string, on: boolean): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ on: users.marketingOptIn })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.role, "sme")))
      .for("update");
    if (!current) return false;
    if (current.on === on) return true;

    const at = new Date();
    const [u] = await tx
      .update(users)
      .set({ marketingOptIn: on, marketingOptInAt: at, ...(on ? { marketingConsentText: MARKETING_CONSENT_TEXT } : {}) })
      .where(eq(users.id, userId))
      .returning(learnerColumns);
    if (!u) return false;

    if (on && !(await isSynced(tx, u))) {
      const regKey = crmEventKey.registration(u.id);
      await insertEvent(tx, { eventKey: regKey, userId, payload: buildCrmPayload(regKey, u, { type: "registration", occurredAt: u.createdAt }) });
    }
    if (await isSynced(tx, u)) {
      const key = crmEventKey.consentChanged(u.id, at);
      await insertEvent(tx, { eventKey: key, userId, payload: buildCrmPayload(key, u, { type: "consent_changed", occurredAt: at }) });
    }
    return true;
  });
}

// ── Drain ────────────────────────────────────────────────────────────────────

interface CrmConfig {
  url: string;
  key: string;
  programId: string;
  cohortId: string | undefined;
}

type ConfigCheck = { state: "disabled" } | { state: "missing"; missing: string[] } | { state: "ok"; config: CrmConfig };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https only (plain http just for a CRM on this machine, e.g. tests). */
function intakeUrlOk(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname));
  } catch {
    return false;
  }
}

export function readCrmConfig(env: Env = process.env): ConfigCheck {
  if (env["CRM_SYNC_ENABLED"] !== "true") return { state: "disabled" };
  const url = env["CRM_INTAKE_URL"]?.trim() ?? "";
  const key = env["POTENTIAL_CRM_INTAKE_KEY"]?.trim() ?? "";
  const programId = env["CRM_PROGRAM_ID"]?.trim() ?? "";
  const cohortId = env["CRM_COHORT_ID"]?.trim() ?? "";
  const missing = [
    ...(!url ? ["CRM_INTAKE_URL"] : intakeUrlOk(url) ? [] : ["CRM_INTAKE_URL (must be an https URL)"]),
    ...(key ? [] : ["POTENTIAL_CRM_INTAKE_KEY"]),
    ...(!programId ? ["CRM_PROGRAM_ID"] : isUuid(programId) ? [] : ["CRM_PROGRAM_ID (must be a UUID)"]),
    ...(!cohortId || isUuid(cohortId) ? [] : ["CRM_COHORT_ID (must be a UUID)"]),
  ];
  if (missing.length) return { state: "missing", missing };
  return { state: "ok", config: { url, key, programId, cohortId: env["CRM_COHORT_ID"]?.trim() || undefined } };
}

export interface CrmSyncOptions {
  fetch?: typeof fetch;
  env?: Env;
  batchSize?: number;
  /** Only rows whose event key starts with this (tests). */
  eventKeyPrefix?: string;
  /** Only this learner's rows (tests). */
  userId?: string;
}

export interface CrmSyncResult {
  skipped?: "disabled" | "missing-config";
  /** The CRM answered 401/403/404: the URL or key is wrong. Nothing was changed. */
  configError?: number;
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  conflicts: number;
}

interface ClaimedRow {
  id: string;
  event_key: string;
  user_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: Date;
  prev_next_attempt_at: Date;
}

let warnedMissing = "";
let warnedConfigError = "";

/** Exponential backoff: 1 min, 2 min, 4 min, … capped at 6 hours. */
function retryDelay(attemptsBefore: number): number {
  return Math.min(FIRST_RETRY_MS * 2 ** Math.min(attemptsBefore, 30), MAX_RETRY_MS);
}

/** Retry-After in seconds or as a date, in ms (0 if absent or unreadable). */
function retryAfterMs(res: Response): number {
  const value = res.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, MAX_RETRY_MS));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.min(at - Date.now(), MAX_RETRY_MS)) : 0;
}

const isRegistration = (key: string) => key.startsWith("hadafi:reg:");

/**
 * Claims up to `limit` due rows and leases them. Registrations go first, so
 * the CRM knows a learner before their other events.
 */
async function claimDue(limit: number, opts: CrmSyncOptions): Promise<ClaimedRow[]> {
  const result = await db.execute(sql`
    UPDATE crm_outbox o SET next_attempt_at = now() + ${`${LEASE_MS} milliseconds`}::interval
    FROM (
      SELECT id, next_attempt_at AS prev FROM crm_outbox
      WHERE sent_at IS NULL AND attempts < ${MAX_ATTEMPTS} AND next_attempt_at <= now()
        ${opts.eventKeyPrefix ? sql`AND starts_with(event_key, ${opts.eventKeyPrefix})` : sql``}
        ${opts.userId ? sql`AND user_id = ${opts.userId}` : sql``}
      ORDER BY (event_key LIKE 'hadafi:reg:%') DESC, next_attempt_at, created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    ) due
    WHERE o.id = due.id
    RETURNING o.id, o.event_key, o.user_id, o.payload, o.attempts, o.created_at, due.prev AS prev_next_attempt_at
  `);
  const rows = result.rows as unknown as ClaimedRow[];
  return rows.sort(
    (a, b) =>
      Number(isRegistration(b.event_key)) - Number(isRegistration(a.event_key)) ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/**
 * Before a row's first send: fills in the program id if it was queued without
 * one, and refreshes the consent fields from the learner's current row (an
 * event can wait in the outbox while consent changes). Saved, so every retry
 * sends exactly these bytes.
 */
async function prepareFirstSend(row: ClaimedRow, config: CrmConfig): Promise<Record<string, unknown>> {
  let payload = row.payload;
  // Queued before a valid CRM_PROGRAM_ID was set: use the configured program (and cohort).
  if (!isUuid(payload["programId"])) {
    const { cohortId: _stale, ...rest } = payload;
    payload = { ...rest, programId: config.programId, ...(config.cohortId ? { cohortId: config.cohortId } : {}) };
  } else if ("cohortId" in payload && !isUuid(payload["cohortId"])) {
    const { cohortId: _bad, ...rest } = payload;
    payload = rest;
  }
  const event = payload["event"];
  if (row.user_id && event && typeof event === "object") {
    const [u] = await db
      .select({ marketingOptIn: users.marketingOptIn, marketingOptInAt: users.marketingOptInAt, marketingConsentText: users.marketingConsentText })
      .from(users)
      .where(eq(users.id, row.user_id));
    if (u) {
      const ev = { ...(event as Record<string, unknown>) };
      for (const k of CONSENT_KEYS) delete ev[k];
      const occurredAt = new Date(String(ev["occurredAt"] ?? Date.now()));
      payload = { ...payload, event: { ...ev, ...consentFields(u, Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt) } };
    }
  }
  if (JSON.stringify(payload) !== JSON.stringify(row.payload)) {
    await db.update(crmOutbox).set({ payload }).where(eq(crmOutbox.id, row.id));
  }
  return payload;
}

async function markRetry(row: ClaimedRow, error: string, delayMs: number): Promise<"retried" | "failed"> {
  const attempts = row.attempts + 1;
  await db
    .update(crmOutbox)
    .set({ attempts, lastError: error, nextAttemptAt: new Date(Date.now() + delayMs) })
    .where(eq(crmOutbox.id, row.id));
  if (attempts >= MAX_ATTEMPTS) {
    logger.error({ eventKey: row.event_key, attempts, error }, "CRM sync: gave up on an event after too many failed tries");
    return "failed";
  }
  return "retried";
}

/**
 * One drain run: claims up to `batchSize` due rows and sends them one by one.
 *
 * 2xx (a "duplicate" answer too) → sent. 409 → the CRM already has this
 * submission with a different body; the payload is frozen, so retrying can't
 * help: marked sent with the conflict in last_error, and logged as an error.
 * 401/403/404 → the URL or key is wrong: every claimed row is handed back
 * untouched, the run stops, and one warning is logged until the config
 * changes. 429, 408, 5xx, timeouts and network errors → retried with backoff
 * (a 429 also ends the run). Any other 4xx → not retried.
 *
 * last_error and logs hold the HTTP status and the CRM's error code only,
 * never response text (it can echo the learner's details).
 */
export async function runCrmSync(opts: CrmSyncOptions = {}): Promise<CrmSyncResult> {
  const result: CrmSyncResult = { claimed: 0, sent: 0, retried: 0, failed: 0, conflicts: 0 };
  const check = readCrmConfig(opts.env ?? process.env);
  if (check.state === "disabled") return { ...result, skipped: "disabled" };
  if (check.state === "missing") {
    const signature = check.missing.join(",");
    if (warnedMissing !== signature) {
      warnedMissing = signature;
      logger.warn(
        { missing: check.missing },
        `CRM sync is enabled but ${check.missing.join(", ")} ${check.missing.length > 1 ? "are" : "is"} not set: nothing will be sent (events keep queueing)`,
      );
    }
    return { ...result, skipped: "missing-config" };
  }
  warnedMissing = "";
  const { config } = check;
  const configSignature = crypto.createHash("sha256").update(`${config.url}\n${config.key}\n${config.programId}`).digest("hex");
  const doFetch = opts.fetch ?? fetch;

  const rows = await claimDue(opts.batchSize ?? BATCH_SIZE, opts);
  result.claimed = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const payload = row.attempts === 0 ? await prepareFirstSend(row, config) : row.payload;

    let res: Response;
    try {
      res = await doFetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
        body: JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      result[await markRetry(row, networkError(err), retryDelay(row.attempts))]++;
      continue;
    }

    if (res.ok) {
      await db.update(crmOutbox).set({ sentAt: new Date(), lastError: null }).where(eq(crmOutbox.id, row.id));
      warnedConfigError = "";
      result.sent++;
      continue;
    }

    const code = await crmErrorCode(res);
    const error = `HTTP ${res.status}${code ? ` ${code}` : ""}`;
    if ([401, 403, 404].includes(res.status)) {
      // Wrong key or URL: not the events' fault. Hand every claimed row back as it was.
      const rest = rows.slice(i);
      for (const r of rest) {
        await db.update(crmOutbox).set({ nextAttemptAt: new Date(r.prev_next_attempt_at) }).where(eq(crmOutbox.id, r.id));
      }
      const signature = `${res.status}:${configSignature}`;
      if (warnedConfigError !== signature) {
        warnedConfigError = signature;
        logger.warn(
          { status: res.status, code },
          `CRM sync: the CRM answered ${res.status}; check CRM_INTAKE_URL and POTENTIAL_CRM_INTAKE_KEY. Nothing is sent until it accepts them (events keep queueing)`,
        );
      }
      result.configError = res.status;
      break;
    }
    if (res.status === 409) {
      await db.update(crmOutbox).set({ sentAt: new Date(), lastError: error }).where(eq(crmOutbox.id, row.id));
      logger.error({ eventKey: row.event_key, error }, "CRM sync: the CRM has this submission with different data");
      result.conflicts++;
    } else if (res.status === 429 || res.status === 408 || res.status >= 500) {
      const delay = Math.max(retryDelay(row.attempts), res.status === 429 ? retryAfterMs(res) : 0);
      result[await markRetry(row, error, delay)]++;
      if (res.status === 429) {
        // The CRM asked us to slow down: hand back the rest of the batch untried.
        const rest = rows.slice(i + 1).map((r) => r.id);
        if (rest.length) {
          await db.execute(sql`
            UPDATE crm_outbox SET next_attempt_at = now() + ${`${delay} milliseconds`}::interval
            WHERE id IN (${sql.join(rest.map((id) => sql`${id}::uuid`), sql`, `)}) AND sent_at IS NULL
          `);
        }
        logger.warn({ retryInMs: delay }, "CRM sync: rate limited by the CRM, pausing");
        break;
      }
    } else {
      await db.update(crmOutbox).set({ attempts: MAX_ATTEMPTS, lastError: error }).where(eq(crmOutbox.id, row.id));
      logger.error({ eventKey: row.event_key, error }, "CRM sync: the CRM refused an event");
      result.failed++;
    }
  }
  return result;
}

export interface CrmOutboxCounts {
  pending: number;
  sent: number;
  failed: number;
  /** Sent, but the CRM answered 409 (see last_error). */
  conflicts: number;
  oldestPendingAt: Date | null;
}

/** Outbox health: pending (still to send or retry), sent, failed (gave up). Read-only. */
export async function crmOutboxCounts(): Promise<CrmOutboxCounts> {
  const result = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE sent_at IS NULL AND attempts < ${MAX_ATTEMPTS})::int AS pending,
      count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent,
      count(*) FILTER (WHERE sent_at IS NULL AND attempts >= ${MAX_ATTEMPTS})::int AS failed,
      count(*) FILTER (WHERE sent_at IS NOT NULL AND last_error IS NOT NULL)::int AS conflicts,
      min(created_at) FILTER (WHERE sent_at IS NULL AND attempts < ${MAX_ATTEMPTS}) AS oldest_pending_at
    FROM crm_outbox
  `);
  const row = result.rows[0] as { pending: number; sent: number; failed: number; conflicts: number; oldest_pending_at: Date | string | null };
  return {
    pending: row.pending,
    sent: row.sent,
    failed: row.failed,
    conflicts: row.conflicts,
    oldestPendingAt: row.oldest_pending_at ? new Date(row.oldest_pending_at) : null,
  };
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const r = await runCrmSync();
    if (r.claimed) {
      const { sent, retried, failed, conflicts, configError } = r;
      logger.info({ sent, retried, failed, conflicts, configError, outbox: await crmOutboxCounts() }, "CRM sync run");
    }
  } catch (err) {
    logger.error({ error: dbError(err) }, "CRM sync run failed");
  } finally {
    running = false;
  }
}

/** Starts the CRM drain timer (the API process only; never in tests). */
export function startCrmSync(): void {
  if (timer) return;
  const check = readCrmConfig();
  logger.info({ crmSync: check.state }, check.state === "ok" ? "CRM sync on" : "CRM sync not sending (events still queue)");
  setTimeout(() => void tick(), 15_000).unref?.();
  timer = setInterval(() => void tick(), INTERVAL_MS);
  timer.unref?.();
}
