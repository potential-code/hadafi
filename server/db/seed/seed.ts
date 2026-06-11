import { pool, db } from "../index";
import { users, liveEvents } from "../schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { seedMentors } from "./seed-mentors";
import { seedOffers } from "./seed-offers";
import { seedCourses } from "./seed-courses";
import { seedCourseContent } from "./seed-course-content";
import { seedPosttests } from "./seed-posttests";

const ADMIN_EMAIL = "admin@email.com";
const ADMIN_PASSWORD = "password";

/**
 * Static snapshot of the 13 live events previously stored in a WordPress
 * database and later surfaced via a static TS constant on the frontend.
 * These are seeded once into `live_events` with status='published'.
 */
const WP_EVENTS = [
  {
    title: "Business Trends to Watch",
    date: "2025-06-22",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=nWxLaQIOQ8M",
    coverImage: null,
  },
  {
    title: "What Investors Look For When Investing",
    date: "2021-06-15",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=EyGYUZXBnZM",
    coverImage: null,
  },
  {
    title: "Enhance Your Learning and Development",
    date: "2021-06-08",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=V3qriSV8ZJw",
    coverImage: null,
  },
  {
    title: "Use Data to Grow Your Business",
    date: "2021-06-01",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=7sLOeIkbn5c",
    coverImage: null,
  },
  {
    title: "Boost Your Digital Marketing",
    date: "2021-05-25",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=MNCxeA_deZk",
    coverImage: null,
  },
  {
    title: "Grow Your Community",
    date: "2021-05-18",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=Wy_ZD_z1rpE",
    coverImage: null,
  },
  {
    title: "Sustainability and Impact",
    date: "2021-05-11",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=m4seAO9SjgU",
    coverImage: null,
  },
  {
    title: "Prepare for Funding",
    date: "2021-05-04",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=M345P_JPhzY",
    coverImage: null,
  },
  {
    title: "Develop your Next Innovation",
    date: "2021-04-27",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=-W4Ry6hUHs0",
    coverImage: null,
  },
  {
    title: "Developing your Digitization Strategy",
    date: "2025-04-20",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description: null,
    recordingLink: "https://www.youtube.com/watch?v=bE86eRKtEpQ",
    coverImage: null,
  },
  {
    title: "Enhance your Operations",
    date: "2021-04-12",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description:
      "Join us to learn how to automate your manual and paper-based processes in order to decrease your operation costs.",
    recordingLink: "https://www.youtube.com/watch?v=CemEaQ5nddM",
    coverImage: "/images/events/webinar-3.jpg",
  },
  {
    title: "Digitizing your Sales",
    date: "2021-04-05",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description:
      "Join us to learn how to digitize your sales process to get more leads, close deals faster and skyrocket your sales revenue.",
    recordingLink: "https://www.youtube.com/watch?v=mbvdIB59l7g",
    coverImage: "/images/events/webinar-2.jpg",
  },
  {
    title: "Overview about SME Program",
    date: "2021-03-29",
    time: "5:00 PM / GST - UAE time",
    type: "Webinar",
    description:
      "Join us to know more about the SME Evolution Program, how to register and how to make use of the amazing free and discounted offers.",
    recordingLink: "https://www.youtube.com/watch?v=cQE1GFRlHFw",
    coverImage: "/images/events/webinar-1.jpg",
  },
] as const

/**
 * Seeds the 13 legacy WordPress events into `live_events`.
 * Idempotent — skips if any rows already exist in the table.
 */
async function seedLiveEvents(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(liveEvents)

  if (Number(count) > 0) {
    console.log("[seed] Live events already seeded — skipping.")
    return
  }

  await db.insert(liveEvents).values(
    WP_EVENTS.map((e) => ({
      ...e,
      status: "published" as const,
      track: null,
      meetingLink: null,
    })),
  )

  console.log(`[seed] Seeded ${WP_EVENTS.length} live events.`)
}

/**
 * Main seed entry point.
 * Creates the default admin user and populates the live_events table.
 */
export async function seed(): Promise<void> {
  console.log("[seed] Starting seed...")

  // ── Admin user ──────────────────────────────────────────────────────────────
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1)

  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
    await db.insert(users).values({
      fullName: "Admin",
      email: ADMIN_EMAIL,
      passwordHash,
      role: "admin",
    })
    console.log("[seed] Admin user created: admin@email.com")
  } else {
    console.log("[seed] Admin user already exists — skipping.")
  }

  // ── Live events ─────────────────────────────────────────────────────────────
  await seedLiveEvents()

  // ── Offers ──────────────────────────────────────────────────────────────────
  await seedOffers()

  // ── Courses ─────────────────────────────────────────────────────────────────
  await seedCourses()

  // ── Course content (modules, units, blocks, pre-assessments) ─────────────
  await seedCourseContent()

  // ── Post-tests ───────────────────────────────────────────────────────────
  await seedPosttests()

  // ── Human mentors ───────────────────────────────────────────────────────────
  await seedMentors()
}

// @ts-ignore — import.meta.main is Bun-specific; falsy in Node so this block is skipped when bundled
if (import.meta.main) {
  seed()
    .catch((err) => {
      console.error("[seed] Error:", err)
      process.exit(1)
    })
    .finally(async () => {
      await pool.end()
      console.log("[seed] Done.")
    })
}
