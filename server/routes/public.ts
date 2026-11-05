import { Router, type IRouter } from "express";
import { asc, count, eq } from "drizzle-orm";
import { db } from "../db";
import { courses, modules, units, users, offers, liveEvents } from "../db/schema";
import { AI_MENTOR_BOT_IDS } from "../controllers/aiMentor.controller";

/**
 * Unauthenticated figures for the public homepage, so every number it shows
 * comes from the database instead of being written into the page.
 * Each answer is cached in memory for five minutes.
 */
const router: IRouter = Router();

const TTL = 5 * 60_000;

export type PublicCounts = {
  /** Published courses. */
  courses: number;
  /** Expert (human) mentors: the same people GET /api/mentors/public lists. */
  mentors: number;
  /** AI mentors learners can chat with (the server's allow-list). */
  aiMentors: number;
  /** Published member offers. */
  offers: number;
  /** Published live events, past and upcoming. */
  events: number;
};

export type PublicCoursePick = { id: string; title: string; cover: string | null; units: number };

let countsCache: { value: PublicCounts; at: number } | null = null;
let picksCache: { value: PublicCoursePick[]; at: number } | null = null;

/** Tests call this so a figure changed in the database shows straight away. */
export function resetPublicCache(): void {
  countsCache = null;
  picksCache = null;
}

async function loadCounts(): Promise<PublicCounts> {
  const [c, m, o, e] = await Promise.all([
    db.select({ n: count() }).from(courses).where(eq(courses.status, "published")),
    db.select({ n: count() }).from(users).where(eq(users.role, "mentor")),
    db.select({ n: count() }).from(offers).where(eq(offers.status, "published")),
    db.select({ n: count() }).from(liveEvents).where(eq(liveEvents.status, "published")),
  ]);
  return {
    courses: Number(c[0]?.n ?? 0),
    mentors: Number(m[0]?.n ?? 0),
    aiMentors: AI_MENTOR_BOT_IDS.size,
    offers: Number(o[0]?.n ?? 0),
    events: Number(e[0]?.n ?? 0),
  };
}

/** The homepage's "More courses" picks, in this order, when they are published. */
const FEATURED_TITLES = [
  "financial literacy",
  "communication skills",
  "presentation skills",
  "managing your cash flow",
  "digital marketing",
  "teamwork",
];

/**
 * Up to six published courses that have a cover and at least one unit, with
 * their unit counts: the featured titles first, then the oldest courses.
 */
async function loadPicks(): Promise<PublicCoursePick[]> {
  const rows = await db
    .select({ id: courses.id, title: courses.title, cover: courses.cover, units: count(units.id) })
    .from(courses)
    .leftJoin(modules, eq(modules.courseId, courses.id))
    .leftJoin(units, eq(units.moduleId, modules.id))
    .where(eq(courses.status, "published"))
    .groupBy(courses.id, courses.title, courses.cover, courses.createdAt)
    .orderBy(asc(courses.createdAt), asc(courses.title));
  const rank = (title: string) => {
    const i = FEATURED_TITLES.indexOf(title.trim().toLowerCase());
    return i === -1 ? FEATURED_TITLES.length : i;
  };
  return rows
    .filter((r) => r.cover && Number(r.units) > 0)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r.title) - rank(b.r.title) || a.i - b.i)
    .map(({ r }) => r)
    .slice(0, 6)
    .map((r) => ({ id: r.id, title: r.title, cover: r.cover, units: Number(r.units) }));
}

/** GET /api/public/counts — { success, data: PublicCounts } */
router.get("/counts", async (_req, res, next) => {
  try {
    if (!countsCache || Date.now() - countsCache.at > TTL) {
      countsCache = { value: await loadCounts(), at: Date.now() };
    }
    res.set("Cache-Control", "public, max-age=300");
    res.json({ success: true, data: countsCache.value });
  } catch (err) {
    next(err);
  }
});

/** GET /api/public/courses — { success, data: PublicCoursePick[] } */
router.get("/courses", async (_req, res, next) => {
  try {
    if (!picksCache || Date.now() - picksCache.at > TTL) {
      picksCache = { value: await loadPicks(), at: Date.now() };
    }
    res.set("Cache-Control", "public, max-age=300");
    res.json({ success: true, data: picksCache.value });
  } catch (err) {
    next(err);
  }
});

export default router;
