import { pool, db } from "../index";
import { courses } from "../schema";
import { sql } from "drizzle-orm";
import path from "path";
import cardsJson from "./seed-data/cpt-cards.json";

interface CourseCardMeta {
  course_unit_number: string;
  course_time: string;
  course_unit_link: string;
  course_id: string;
  course_image_url: string;
}

interface CourseCard {
  post_id: number;
  title: string;
  slug: string;
  status: string;
  content: string;
  featured_image_url: string | null;
  extra_image_url: string | null;
  meta: CourseCardMeta;
}

export async function seedCourses(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(courses);

  if (Number(count) > 0) {
    console.log("[seed-courses] Already seeded — skipping.");
    return;
  }

  const data = cardsJson as { cpt: { items: CourseCard[] } };
  const published = data.cpt.items.filter((c) => c.status === "publish");

  let seeded = 0;
  for (const card of published) {
    const imageUrl = card.meta.course_image_url;
    let cover: string | null = null;
    if (imageUrl) {
      const ext = path.extname(imageUrl.split("/").pop() || "") || ".png";
      cover = `/images/courses/${card.slug}${ext}`;
    }

    await db.insert(courses).values({
      title: card.title,
      cover,
      status: "published",
      difficulty: "Beginner",
    });

    seeded++;
  }

  console.log(`[seed-courses] Seeded ${seeded} courses.`);
}

// @ts-ignore
if (import.meta.main) {
  seedCourses()
    .catch((err) => {
      console.error("[seed-courses] Error:", err);
      process.exit(1);
    })
    .finally(() => pool.end());
}
