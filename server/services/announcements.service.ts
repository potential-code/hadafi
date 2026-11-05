import crypto from "crypto";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  announcementEmailOptOuts,
  announcementViews,
  announcements,
  notifications,
  users,
  type Announcement,
} from "../db/schema";
import { sendMail } from "../mail/mailer";
import { logger } from "../config/logger";
import { AppError } from "../utils/app-error";
import { notify } from "./notifications.service";

/**
 * Announcements from the Hadafi team (ported from SMEEP): a banner at the top
 * of the audience's pages, a bell notification and, once the client approves
 * learner emails, an email with a signed one-click unsubscribe link.
 *
 * Emails stay off unless ANNOUNCEMENT_EMAILS_ENABLED is exactly "true" (the
 * same rule as REMINDER_EMAILS_ENABLED): with it off, the server refuses an
 * announcement that asks for email.
 */

export const announcementEmailsEnabled = (): boolean => process.env["ANNOUNCEMENT_EMAILS_ENABLED"] === "true";

/** What announcements send mail with (swapped in tests, so no test sends real mail). */
export const announcementDeps = { sendMail };

// ── Audiences ────────────────────────────────────────────────────────────────

export const BUILT_IN_AUDIENCES = ["learners", "mentors", "all"] as const;
export type BuiltInAudience = (typeof BUILT_IN_AUDIENCES)[number];

export interface AudienceMember {
  id: string;
  role: string;
  fullName: string;
  email: string;
}

/**
 * Who an audience kind reaches. The built-in kinds are by role; other kinds
 * (for example one organisation's learners) are added with
 * registerAudience("organisation", (orgId) => …) by the feature that owns
 * them, and then the admin API accepts { audience: "organisation", audienceRef }.
 */
export type AudienceResolver = (ref: string | null) => Promise<AudienceMember[]>;
export interface AudienceKind {
  resolve: AudienceResolver;
  /** Which roles' banners it shows on (e.g. ["sme"]). */
  roles: string[];
  /** Is this user in the audience? (Banners are read per request, so this must be cheap.) */
  includes?: (userId: string, ref: string | null) => Promise<boolean>;
  label?: (ref: string | null) => Promise<string>;
}

const byRoles = (roles: string[]): AudienceResolver => async () =>
  db
    .select({ id: users.id, role: users.role, fullName: users.fullName, email: users.email })
    .from(users)
    .where(inArray(users.role, roles));

const AUDIENCES = new Map<string, AudienceKind>([
  ["learners", { resolve: byRoles(["sme"]), roles: ["sme"], label: async () => "All learners" }],
  ["mentors", { resolve: byRoles(["mentor"]), roles: ["mentor"], label: async () => "Mentors" }],
  ["all", { resolve: byRoles(["sme", "mentor"]), roles: ["sme", "mentor"], label: async () => "Learners and mentors" }],
]);

export function registerAudience(kind: string, def: AudienceKind): void {
  AUDIENCES.set(kind, def);
}

export function audienceKinds(): string[] {
  return [...AUDIENCES.keys()];
}

function audienceOf(kind: string): AudienceKind {
  const a = AUDIENCES.get(kind);
  if (!a) throw new AppError("Unknown audience", 422, "VALIDATION_ERROR");
  return a;
}

async function optedOut(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: announcementEmailOptOuts.userId })
    .from(announcementEmailOptOuts)
    .where(inArray(announcementEmailOptOuts.userId, ids));
  return new Set(rows.map((r) => r.id));
}

/** How many people an audience reaches, and how many of them could get the email. */
export async function countAudience(kind: string, ref: string | null = null): Promise<{ people: number; emailable: number }> {
  const people = await audienceOf(kind).resolve(ref);
  const out = await optedOut(people.map((p) => p.id));
  return { people: people.length, emailable: people.filter((p) => p.email && !out.has(p.id)).length };
}

// ── Unsubscribe tokens ───────────────────────────────────────────────────────

function secret(): string {
  const s = process.env["BETTER_AUTH_SECRET"];
  if (s) return s;
  if (process.env["NODE_ENV"] === "production") throw new Error("BETTER_AUTH_SECRET is not set");
  return "hadafi-dev-unsubscribe";
}

const mac = (userId: string) => crypto.createHmac("sha256", secret()).update(`announcement-unsubscribe:${userId}`).digest("base64url").slice(0, 32);

export function unsubscribeToken(userId: string): string {
  return `${Buffer.from(userId).toString("base64url")}.${mac(userId)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [id64, given] = String(token).split(".");
  if (!id64 || !given) return null;
  const userId = Buffer.from(id64, "base64url").toString("utf8");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(mac(userId));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? userId : null;
}

export async function setAnnouncementEmails(userId: string, on: boolean): Promise<boolean> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!u) return false;
  if (on) await db.delete(announcementEmailOptOuts).where(eq(announcementEmailOptOuts.userId, userId));
  else await db.insert(announcementEmailOptOuts).values({ userId }).onConflictDoNothing();
  return true;
}

export async function getAnnouncementEmails(userId: string): Promise<boolean> {
  return !(await optedOut([userId])).has(userId);
}

// ── Create, edit, send ───────────────────────────────────────────────────────

export interface AnnouncementInput {
  title: string;
  body: string;
  linkUrl?: string | null;
  linkLabel?: string | null;
  audience: string;
  audienceRef?: string | null;
  showBanner: boolean;
  notify: boolean;
  email: boolean;
  /** now: send at once; schedule: send at startsAt; draft: keep it for later. */
  mode: "now" | "schedule" | "draft";
  startsAt?: string | null;
  endsAt?: string | null;
}

const isExternal = (url: string | null | undefined) => !!url && /^https?:\/\//i.test(url);

function check(input: AnnouncementInput): { startsAt: Date | null; endsAt: Date | null } {
  audienceOf(input.audience);
  if (input.email && !announcementEmailsEnabled()) {
    throw new AppError("Announcement emails are off until the client approves learner emails.", 422, "EMAIL_DISABLED");
  }
  if (input.mode !== "draft" && !input.showBanner && !input.notify && !input.email) {
    throw new AppError("Choose at least one way to send it.", 422, "VALIDATION_ERROR");
  }
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (input.mode === "schedule" && (!startsAt || startsAt.getTime() <= Date.now() + 60_000)) {
    throw new AppError("Pick a time at least a minute from now to schedule it.", 422, "VALIDATION_ERROR");
  }
  const from = input.mode === "schedule" ? startsAt!.getTime() : Date.now();
  if (endsAt && endsAt.getTime() <= from) {
    throw new AppError("The end date must be after it goes out.", 422, "VALIDATION_ERROR");
  }
  return { startsAt: input.mode === "schedule" ? startsAt : null, endsAt };
}

function values(input: AnnouncementInput, when: { startsAt: Date | null; endsAt: Date | null }) {
  return {
    title: input.title,
    body: input.body,
    linkUrl: input.linkUrl || null,
    linkLabel: input.linkUrl ? input.linkLabel || null : null,
    audience: input.audience,
    audienceRef: input.audienceRef ?? null,
    showBanner: input.showBanner,
    notify: input.notify,
    email: input.email,
    status: input.mode === "now" ? "sent" : input.mode === "schedule" ? "scheduled" : "draft",
    startsAt: input.mode === "now" ? new Date() : when.startsAt,
    endsAt: when.endsAt,
  };
}

export async function createAnnouncement(adminId: string, input: AnnouncementInput): Promise<Announcement> {
  const when = check(input);
  const [row] = await db
    .insert(announcements)
    .values({ ...values(input, when), createdBy: adminId })
    .returning();
  return input.mode === "now" ? deliver(row!) : row!;
}

/** Edits a draft or a scheduled announcement (a sent one can only be ended). */
export async function updateAnnouncement(id: string, input: AnnouncementInput): Promise<Announcement> {
  const when = check(input);
  const [row] = await db
    .update(announcements)
    .set(values(input, when))
    .where(and(eq(announcements.id, id), inArray(announcements.status, ["draft", "scheduled"])))
    .returning();
  if (!row) throw new AppError("Only a draft or a scheduled announcement can be changed.", 404, "NOT_FOUND");
  return input.mode === "now" ? deliver(row) : row;
}

/** Deletes a draft or cancels a scheduled announcement. */
export async function deleteAnnouncement(id: string): Promise<boolean> {
  const rows = await db
    .delete(announcements)
    .where(and(eq(announcements.id, id), inArray(announcements.status, ["draft", "scheduled"])))
    .returning({ id: announcements.id });
  return rows.length > 0;
}

/**
 * Sends a sent-status announcement: bell items and (if on) emails, and
 * records how many people it reached. Each person gets the bell item once
 * (dedupe key), so a retry never repeats it.
 */
async function deliver(a: Announcement): Promise<Announcement> {
  const people = await audienceOf(a.audience).resolve(a.audienceRef);
  if (a.notify) {
    for (const role of ["sme", "mentor"]) {
      const ids = people.filter((p) => p.role === role).map((p) => p.id);
      const home = role === "mentor" ? "/mentor/dashboard" : "/dashboard";
      await notify(ids, {
        type: "announcement",
        title: a.title,
        body: a.body.length > 140 ? `${a.body.slice(0, 137)}…` : a.body,
        link: a.linkUrl && !isExternal(a.linkUrl) && a.linkUrl.startsWith(role === "mentor" ? "/mentor" : "/dashboard") ? a.linkUrl : home,
        dedupeKey: `announcement:${a.id}`,
      });
    }
  }
  let emailRecipients = 0;
  if (a.email && announcementEmailsEnabled()) {
    const out = await optedOut(people.map((p) => p.id));
    const recipients = people.filter((p) => p.email && !out.has(p.id));
    emailRecipients = recipients.length;
    void sendAnnouncementEmails(a, recipients);
  }
  const [row] = await db
    .update(announcements)
    .set({ audienceSize: people.length, emailRecipients })
    .where(eq(announcements.id, a.id))
    .returning();
  return row ?? a;
}

async function sendAnnouncementEmails(a: Announcement, recipients: AudienceMember[]): Promise<void> {
  const site = process.env["FRONTEND_URL"] ?? "http://localhost:3000";
  const link = a.linkUrl ? (isExternal(a.linkUrl) ? a.linkUrl : `${site}${a.linkUrl}`) : null;
  const paragraphs = a.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let sent = 0;
  // A few at a time, so a large audience doesn't flood the mail provider.
  for (let i = 0; i < recipients.length; i += 5) {
    await Promise.all(
      recipients.slice(i, i + 5).map((r) =>
        announcementDeps
          .sendMail({
            to: r.email,
            subject: a.title,
            template: "announcement",
            context: {
              name: r.fullName.split(/\s+/)[0],
              title: a.title,
              paragraphs,
              link,
              linkLabel: a.linkLabel || "Open Hadafi",
              unsubscribeUrl: `${site}/unsubscribe?token=${unsubscribeToken(r.id)}`,
            },
          })
          .then(() => void sent++)
          .catch((err: unknown) => logger.error({ err, announcement: a.id }, "Announcement email failed")),
      ),
    );
    if (i + 5 < recipients.length) await new Promise((res) => setTimeout(res, 200));
  }
  logger.info({ announcement: a.id, sent, of: recipients.length }, "Announcement emails sent");
}

/** Takes the banner down now and removes the bell item for people who hadn't opened it. */
export async function endAnnouncement(id: string): Promise<boolean> {
  const rows = await db
    .update(announcements)
    .set({ archivedAt: new Date() })
    .where(and(eq(announcements.id, id), eq(announcements.status, "sent"), isNull(announcements.archivedAt)))
    .returning({ id: announcements.id });
  if (!rows.length) return false;
  await removeUnreadBellItems(id);
  return true;
}

async function removeUnreadBellItems(id: string): Promise<void> {
  await db
    .delete(notifications)
    .where(and(eq(notifications.dedupeKey, `announcement:${id}`), isNull(notifications.readAt)));
}

// ── The timer: scheduled ones go out, ended ones come down ──────────────────

/** One pass (exported for tests). Each announcement is claimed atomically, so two passes never both send it. */
export async function runAnnouncementDispatch(now = new Date()): Promise<{ sent: number; ended: number }> {
  const due = await db
    .update(announcements)
    .set({ status: "sent" })
    .where(and(eq(announcements.status, "scheduled"), lte(announcements.startsAt, now)))
    .returning();
  for (const a of due) {
    try {
      await deliver(a);
    } catch (err) {
      logger.error({ err, announcement: a.id }, "Scheduled announcement failed to send");
    }
  }
  const over = await db
    .update(announcements)
    .set({ archivedAt: sql`${announcements.endsAt}` })
    .where(
      and(
        eq(announcements.status, "sent"),
        isNull(announcements.archivedAt),
        isNotNull(announcements.endsAt),
        lte(announcements.endsAt, now),
      ),
    )
    .returning({ id: announcements.id });
  for (const a of over) await removeUnreadBellItems(a.id);
  return { sent: due.length, ended: over.length };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Every minute. ANNOUNCEMENTS_TIMER_ENABLED=false stops it (e.g. a second API container). */
export function startAnnouncementDispatcher(): void {
  if (timer || process.env["ANNOUNCEMENTS_TIMER_ENABLED"] === "false") return;
  const tick = () =>
    void runAnnouncementDispatch().catch((err: unknown) => logger.error({ err }, "Announcement timer failed"));
  timer = setInterval(tick, 60_000);
  timer.unref?.();
}

// ── Lists ────────────────────────────────────────────────────────────────────

export type DisplayStatus = "draft" | "scheduled" | "live" | "ended";

export function displayStatus(a: Pick<Announcement, "status" | "archivedAt" | "endsAt">, now = Date.now()): DisplayStatus {
  if (a.status === "draft") return "draft";
  if (a.status === "scheduled") return "scheduled";
  if (a.archivedAt || (a.endsAt && a.endsAt.getTime() <= now)) return "ended";
  return "live";
}

/** Past and upcoming announcements for the admin page, with reach. */
export async function listAnnouncements() {
  const rows = await db
    .select({ a: announcements, createdByName: users.fullName })
    .from(announcements)
    .leftJoin(users, eq(users.id, announcements.createdBy))
    .orderBy(desc(sql`coalesce(${announcements.startsAt}, ${announcements.createdAt})`))
    .limit(200);
  const ids = rows.filter((r) => r.a.status === "sent").map((r) => r.a.id);
  const reach = new Map<string, number>();
  if (ids.length) {
    // People who saw the banner or opened the bell item, each counted once.
    const result = await db.execute(sql`
      SELECT announcement_id::text AS id, count(DISTINCT user_id)::int AS n FROM (
        SELECT announcement_id, user_id FROM announcement_views
         WHERE announcement_id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
        UNION
        SELECT substring(dedupe_key from 14)::uuid, user_id FROM notifications
         WHERE dedupe_key IN (${sql.join(ids.map((id) => sql`${`announcement:${id}`}`), sql`, `)})
           AND read_at IS NOT NULL
      ) s GROUP BY announcement_id`);
    for (const r of result.rows as { id: string; n: number }[]) reach.set(r.id, Number(r.n));
  }
  const labels = new Map<string, string>();
  for (const r of rows) {
    const key = `${r.a.audience}:${r.a.audienceRef ?? ""}`;
    if (!labels.has(key)) labels.set(key, (await AUDIENCES.get(r.a.audience)?.label?.(r.a.audienceRef)) ?? r.a.audience);
  }
  return rows.map((r) => ({
    ...r.a,
    displayStatus: displayStatus(r.a),
    audienceLabel: labels.get(`${r.a.audience}:${r.a.audienceRef ?? ""}`)!,
    reach: reach.get(r.a.id) ?? 0,
    createdByName: r.createdByName,
  }));
}

/** Banners up now for this user (by role, or by a registered audience's own check), newest first. */
export async function activeBanners(userId: string, role: string): Promise<Pick<Announcement, "id" | "title" | "body" | "linkUrl" | "linkLabel">[]> {
  const kinds = [...AUDIENCES.entries()].filter(([, k]) => k.roles.includes(role)).map(([kind]) => kind);
  if (!kinds.length) return [];
  const now = new Date();
  const rows = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.status, "sent"),
        eq(announcements.showBanner, true),
        isNull(announcements.archivedAt),
        inArray(announcements.audience, kinds),
        lte(announcements.startsAt, now),
        or(isNull(announcements.endsAt), gt(announcements.endsAt, now)),
      ),
    )
    .orderBy(desc(announcements.startsAt))
    .limit(10);
  const mine: Announcement[] = [];
  for (const a of rows) {
    const includes = AUDIENCES.get(a.audience)?.includes;
    if (!includes || (await includes(userId, a.audienceRef))) mine.push(a);
    if (mine.length === 3) break;
  }
  if (mine.length) {
    await db
      .insert(announcementViews)
      .values(mine.map((a) => ({ announcementId: a.id, userId })))
      .onConflictDoNothing();
  }
  return mine.map((a) => ({ id: a.id, title: a.title, body: a.body, linkUrl: a.linkUrl, linkLabel: a.linkLabel }));
}
