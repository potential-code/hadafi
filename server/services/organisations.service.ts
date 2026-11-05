import { randomInt } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { authSessions, organisations, users, type Organisation } from "../db/schema";
import { AppError } from "../utils/app-error";
import { sendMail } from "../mail/mailer";
import { logger } from "../config/logger";
import { getLearningGain, type LearningGain } from "./admin.learningGain.service";
import { notify } from "./notifications.service";

/**
 * Partner organisations: their learners (joined with the organisation's
 * sign-up link, or added by an admin), their partner contacts (role
 * 'partner', who sign in with an emailed code like everyone else), and the
 * read-only dashboard both admins and partner contacts see.
 * Ported from SMEEP db40881 / f31dd6e, adapted to Hadafi (no journeys; partner
 * logins are created by the admin directly, no setup link: Better Auth's email
 * codes prove the address at every sign-in).
 */

export const ORGANISATION_TYPES = ["government", "university", "corporate", "incubator", "investor", "other"] as const;
export type OrganisationType = (typeof ORGANISATION_TYPES)[number];

/** The role a partner contact's login has. */
export const PARTNER_ROLE = "partner";

// No 0/O, 1/I/L: codes are read aloud and typed from slides.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const frontend = () => (process.env["FRONTEND_URL"] || "http://localhost:3000").replace(/\/$/, "");
export const joinLink = (code: string) => `${frontend()}/sign-up?org=${code}`;

const NOT_FOUND = () => new AppError("Organisation not found", 404, "NOT_FOUND");

// ── Organisations ────────────────────────────────────────────────────────────

export interface OrganisationRow {
  id: string;
  name: string;
  type: string;
  joinCode: string;
  joinLink: string;
  joinEnabled: boolean;
  createdAt: string;
  learners: number;
  activeLearners: number;
  partners: number;
}

export async function listOrganisations(): Promise<OrganisationRow[]> {
  const rows = (
    await db.execute(sql`
      SELECT o.id, o.name, o.type, o.join_code, o.join_enabled, o.created_at,
        (SELECT count(*) FROM users u WHERE u.organisation_id = o.id AND u.role = 'sme')::int AS learners,
        (SELECT count(*) FROM users u WHERE u.organisation_id = o.id AND u.role = 'sme'
           AND u.last_active_at > now() - interval '30 days')::int AS active_learners,
        (SELECT count(*) FROM users u WHERE u.organisation_id = o.id AND u.role = ${PARTNER_ROLE})::int AS partners
      FROM organisations o
      WHERE o.archived_at IS NULL
      ORDER BY o.name
    `)
  ).rows as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    type: String(r.type),
    joinCode: String(r.join_code),
    joinLink: joinLink(String(r.join_code)),
    joinEnabled: Boolean(r.join_enabled),
    createdAt: new Date(String(r.created_at)).toISOString(),
    learners: Number(r.learners),
    activeLearners: Number(r.active_learners),
    partners: Number(r.partners),
  }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createOrganisation(adminId: string, input: { name: string; type: OrganisationType }): Promise<Organisation> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db
      .insert(organisations)
      .values({ name: input.name.trim(), type: input.type, createdBy: adminId, joinCode: newJoinCode() })
      .onConflictDoNothing({ target: organisations.joinCode })
      .returning();
    if (row) return row;
  }
  throw new AppError("Couldn't create a sign-up code. Try again.", 500, "CODE_COLLISION");
}

/** A live (not archived) organisation, or 404. */
export async function getOrganisation(id: string): Promise<Organisation> {
  if (!UUID.test(id)) throw NOT_FOUND();
  const [org] = await db.select().from(organisations).where(and(eq(organisations.id, id), isNull(organisations.archivedAt)));
  if (!org) throw NOT_FOUND();
  return org;
}

export async function updateOrganisation(
  id: string,
  patch: { name?: string; type?: OrganisationType; joinEnabled?: boolean },
): Promise<Organisation> {
  await getOrganisation(id);
  const [row] = await db
    .update(organisations)
    .set({ ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) })
    .where(eq(organisations.id, id))
    .returning();
  return row!;
}

/** A new sign-up code; the old link stops working. */
export async function regenerateJoinCode(id: string): Promise<Organisation> {
  await getOrganisation(id);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db.update(organisations).set({ joinCode: newJoinCode() }).where(eq(organisations.id, id)).returning();
      return row!;
    } catch {
      // unique clash: try another code
    }
  }
  throw new AppError("Couldn't create a sign-up code. Try again.", 500, "CODE_COLLISION");
}

/**
 * Archives the organisation: its sign-up link stops, its learners leave it
 * (their accounts and progress stay), and its partner logins are removed
 * (their sessions go with them, so access ends on the next request).
 */
export async function archiveOrganisation(id: string): Promise<void> {
  await getOrganisation(id);
  await db.transaction(async (tx) => {
    await tx.update(organisations).set({ archivedAt: new Date(), joinEnabled: false }).where(eq(organisations.id, id));
    const partnerIds = tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organisationId, id), eq(users.role, PARTNER_ROLE)));
    await tx.delete(authSessions).where(inArray(authSessions.userId, partnerIds));
    await tx.delete(users).where(and(eq(users.organisationId, id), eq(users.role, PARTNER_ROLE)));
    await tx.update(users).set({ organisationId: null }).where(eq(users.organisationId, id));
  });
}

// ── Members ──────────────────────────────────────────────────────────────────

/**
 * The ids of an organisation's people: its learners by default, or the roles
 * asked for (e.g. ["partner"], ["sme", "partner"]). Empty for an archived or
 * unknown organisation. For other features that target an organisation
 * (announcements, events…).
 */
export async function listOrganisationMemberIds(
  organisationId: string,
  opts: { roles?: readonly string[] } = {},
): Promise<string[]> {
  if (!UUID.test(organisationId)) return [];
  const roles = opts.roles?.length ? [...opts.roles] : ["sme"];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(organisations, eq(organisations.id, users.organisationId))
    .where(and(eq(users.organisationId, organisationId), inArray(users.role, roles), isNull(organisations.archivedAt)));
  return rows.map((r) => r.id);
}

// ── Joining ──────────────────────────────────────────────────────────────────

/** The organisation a sign-up code joins, or null when the code doesn't work (unknown, off or archived). */
export async function findJoinable(code: string): Promise<Organisation | null> {
  const c = normaliseCode(code);
  if (c.length < 4 || c.length > 16) return null;
  const [org] = await db
    .select()
    .from(organisations)
    .where(and(eq(organisations.joinCode, c), eq(organisations.joinEnabled, true), isNull(organisations.archivedAt)));
  return org ?? null;
}

export interface AddLearnersResult {
  added: string[];
  moved: string[];
  already: string[];
  notFound: string[];
  notLearners: string[];
}

/**
 * Puts existing learners into the organisation by email. Each one added is
 * told in the bell (in-app only, no email) that the organisation can now see
 * their learning record, and that they can leave from their profile.
 */
export async function addLearnersByEmail(organisationId: string, emails: string[]): Promise<AddLearnersResult> {
  const org = await getOrganisation(organisationId);
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const result: AddLearnersResult = { added: [], moved: [], already: [], notFound: [], notLearners: [] };
  if (!wanted.length) return result;
  const found = await db
    .select({ id: users.id, email: users.email, role: users.role, organisationId: users.organisationId })
    .from(users)
    .where(inArray(sql`lower(${users.email})`, wanted));
  const byEmail = new Map(found.map((u) => [u.email.toLowerCase(), u]));
  const toAdd: string[] = [];
  for (const email of wanted) {
    const u = byEmail.get(email);
    if (!u) result.notFound.push(email);
    else if (u.role !== "sme") result.notLearners.push(email);
    else if (u.organisationId === organisationId) result.already.push(email);
    else {
      (u.organisationId ? result.moved : result.added).push(email);
      toAdd.push(u.id);
    }
  }
  if (toAdd.length) {
    await db
      .update(users)
      .set({ organisationId })
      .where(and(inArray(users.id, toAdd), eq(users.role, "sme")));
    await notify(toAdd, {
      type: "organisation",
      title: `You're now part of ${org.name} on Hadafi`,
      body: `${org.name} can see your learning record from now on: courses, exams, certificates and mentor sessions. You can leave from your profile.`,
      link: "/dashboard/profile",
    });
  }
  return result;
}

export async function removeLearner(organisationId: string, userId: string): Promise<void> {
  if (!UUID.test(userId)) throw new AppError("That learner isn't in this organisation", 404, "NOT_FOUND");
  const rows = await db
    .update(users)
    .set({ organisationId: null })
    .where(and(eq(users.id, userId), eq(users.organisationId, organisationId), eq(users.role, "sme")))
    .returning({ id: users.id });
  if (!rows.length) throw new AppError("That learner isn't in this organisation", 404, "NOT_FOUND");
}

/** The learner's own organisation (for their profile), or null. */
export async function myOrganisation(userId: string): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: organisations.id, name: organisations.name })
    .from(users)
    .innerJoin(organisations, eq(organisations.id, users.organisationId))
    .where(and(eq(users.id, userId), eq(users.role, "sme"), isNull(organisations.archivedAt)));
  return row ?? null;
}

export async function leaveOrganisation(userId: string): Promise<void> {
  await db.update(users).set({ organisationId: null }).where(and(eq(users.id, userId), eq(users.role, "sme")));
}

// ── Partner contacts ─────────────────────────────────────────────────────────

export interface PartnerContact {
  id: string;
  fullName: string;
  email: string;
  /** Active: has signed in. Invited: not yet. */
  status: "active" | "invited";
  /** Active: last time they used Hadafi. Invited: when the login was created. */
  at: string | null;
}

export async function listPartners(organisationId: string): Promise<PartnerContact[]> {
  await getOrganisation(organisationId);
  const rows = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, lastActiveAt: users.lastActiveAt, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.organisationId, organisationId), eq(users.role, PARTNER_ROLE)))
    .orderBy(users.fullName);
  return rows.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    status: u.lastActiveAt ? "active" : "invited",
    at: (u.lastActiveAt ?? u.createdAt).toISOString(),
  }));
}

/**
 * Gives a partner contact a login tied to the organisation (role 'partner',
 * email already trusted: the admin vouches for it, and every sign-in is by a
 * code sent to it). They're emailed where to sign in. The email must not
 * already have a Hadafi account: a learner can't be turned into a partner.
 */
export async function invitePartner(
  organisationId: string,
  input: { fullName: string; email: string },
): Promise<PartnerContact> {
  const org = await getOrganisation(organisationId);
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email));
  if (existing) {
    throw new AppError("That email already has a Hadafi account. Use a different email for the partner login.", 409, "EMAIL_IN_USE");
  }
  const [user] = await db
    .insert(users)
    .values({ fullName: input.fullName.trim(), email, emailVerified: true, role: PARTNER_ROLE, organisationId })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!user) {
    throw new AppError("That email already has a Hadafi account. Use a different email for the partner login.", 409, "EMAIL_IN_USE");
  }
  const signInLink = `${frontend()}/login`;
  void sendMail({
    to: email,
    subject: `Your Hadafi partner dashboard for ${org.name}`,
    template: "partner-invite",
    context: { name: user.fullName, organisation: org.name, email, signInLink },
  }).catch((err) => logger.error({ err }, "[organisations] partner invite email failed"));
  return { id: user.id, fullName: user.fullName, email, status: "invited", at: user.createdAt.toISOString() };
}

/**
 * Removes a partner contact's login at once: their sessions are deleted and
 * the account goes (learners are untouched). The API checks the users row on
 * every request, so even a cached session cookie is refused straight away.
 */
export async function removePartner(organisationId: string, userId: string): Promise<void> {
  if (!UUID.test(userId)) throw new AppError("Partner contact not found", 404, "NOT_FOUND");
  const removed = await db.transaction(async (tx) => {
    const [partner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.organisationId, organisationId), eq(users.role, PARTNER_ROLE)))
      .for("update");
    if (!partner) return false;
    await tx.delete(authSessions).where(eq(authSessions.userId, partner.id));
    await tx.delete(users).where(eq(users.id, partner.id));
    return true;
  });
  if (!removed) throw new AppError("Partner contact not found", 404, "NOT_FOUND");
}

/** The organisation a partner contact can see, or a 403 if they have none. */
export async function partnerOrganisationId(userId: string): Promise<string> {
  const [row] = await db
    .select({ id: organisations.id })
    .from(users)
    .innerJoin(organisations, eq(organisations.id, users.organisationId))
    .where(and(eq(users.id, userId), eq(users.role, PARTNER_ROLE), isNull(organisations.archivedAt)));
  if (!row) throw new AppError("Your partner access has ended. Contact the Hadafi team.", 403, "NO_ORGANISATION");
  return row.id;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface OrganisationDashboard {
  organisation: { id: string; name: string; type: string; joinCode: string; joinLink: string; joinEnabled: boolean };
  kpis: {
    learners: number;
    activeLearners: number;
    learning: number;
    coursesCompleted: number;
    certificates: number;
    mentorSessions: number;
    avgProgress: number | null;
  };
  joinsByWeek: { week: string; joins: number }[];
  courses: { courseId: string; title: string; enrolled: number; completed: number; avgProgress: number }[];
  learners: {
    id: string;
    fullName: string;
    email: string;
    company: string | null;
    joinedAt: string;
    lastActiveAt: string | null;
    coursesStarted: number;
    coursesCompleted: number;
    certificates: number;
    mentorSessions: number;
    avgProgress: number | null;
  }[];
  learningGain: LearningGain;
}

export async function organisationDashboard(organisationId: string): Promise<OrganisationDashboard> {
  const org = await getOrganisation(organisationId);
  const [learnerRows, courseRows, weekRows, gain] = await Promise.all([
    db.execute(sql`
      SELECT u.id, u.full_name, u.email, u.company, u.created_at, u.last_active_at,
        (SELECT count(*) FROM course_enrollments e WHERE e.user_id = u.id)::int AS started,
        (SELECT count(*) FROM user_course_progress p WHERE p.user_id = u.id AND p.completed_at IS NOT NULL)::int AS completed,
        (SELECT count(*) FROM course_certificates c WHERE c.user_id = u.id AND c.status = 'active')::int AS certificates,
        (SELECT count(*) FROM mentor_sessions s WHERE s.sme_user_id = u.id AND s.status <> 'cancelled')::int AS sessions,
        (SELECT avg(coalesce(p.progress_percentage, 0))::float FROM course_enrollments e
           LEFT JOIN user_course_progress p ON p.user_id = e.user_id AND p.course_id = e.course_id
           WHERE e.user_id = u.id) AS avg_progress
      FROM users u
      WHERE u.organisation_id = ${organisationId} AND u.role = 'sme'
      ORDER BY u.last_active_at DESC NULLS LAST, u.full_name
    `),
    db.execute(sql`
      SELECT c.id, c.title, count(*)::int AS enrolled,
        count(p.completed_at)::int AS completed,
        avg(coalesce(p.progress_percentage, 0))::float AS avg_progress
      FROM course_enrollments e
      JOIN users u ON u.id = e.user_id AND u.organisation_id = ${organisationId} AND u.role = 'sme'
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN user_course_progress p ON p.user_id = e.user_id AND p.course_id = e.course_id
      GROUP BY c.id, c.title
      ORDER BY enrolled DESC, c.title
      LIMIT 30
    `),
    db.execute(sql`
      SELECT to_char(w.week, 'YYYY-MM-DD') AS week, count(u.id)::int AS joins
      FROM generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS w(week)
      LEFT JOIN users u ON u.organisation_id = ${organisationId} AND u.role = 'sme'
        AND date_trunc('week', u.created_at) = w.week
      GROUP BY w.week ORDER BY w.week
    `),
    getLearningGain({ organisationId }),
  ]);

  const learners = (learnerRows.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    fullName: String(r.full_name),
    email: String(r.email),
    company: r.company ? String(r.company) : null,
    joinedAt: new Date(String(r.created_at)).toISOString(),
    lastActiveAt: r.last_active_at ? new Date(String(r.last_active_at)).toISOString() : null,
    coursesStarted: Number(r.started),
    coursesCompleted: Number(r.completed),
    certificates: Number(r.certificates),
    mentorSessions: Number(r.sessions),
    avgProgress: r.avg_progress == null ? null : Math.round(Number(r.avg_progress)),
  }));
  const learning = learners.filter((l) => l.coursesStarted > 0);
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return {
    organisation: { id: org.id, name: org.name, type: org.type, joinCode: org.joinCode, joinLink: joinLink(org.joinCode), joinEnabled: org.joinEnabled },
    kpis: {
      learners: learners.length,
      activeLearners: learners.filter((l) => l.lastActiveAt && new Date(l.lastActiveAt).getTime() > monthAgo).length,
      learning: learning.length,
      coursesCompleted: learners.reduce((n, l) => n + l.coursesCompleted, 0),
      certificates: learners.reduce((n, l) => n + l.certificates, 0),
      mentorSessions: learners.reduce((n, l) => n + l.mentorSessions, 0),
      avgProgress: learning.length ? Math.round(learning.reduce((n, l) => n + (l.avgProgress ?? 0), 0) / learning.length) : null,
    },
    joinsByWeek: (weekRows.rows as Array<Record<string, unknown>>).map((r) => ({ week: String(r.week), joins: Number(r.joins) })),
    courses: (courseRows.rows as Array<Record<string, unknown>>).map((r) => ({
      courseId: String(r.id),
      title: String(r.title),
      enrolled: Number(r.enrolled),
      completed: Number(r.completed),
      avgProgress: Math.round(Number(r.avg_progress)),
    })),
    learners,
    learningGain: gain,
  };
}
