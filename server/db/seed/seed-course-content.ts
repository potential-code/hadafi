import path from "path";
import fs from "fs";
import { pool, db } from "../index";
import {
  courses,
  modules,
  units,
  learningBlocks,
  blockQuestions,
  assessments,
  assessmentQuestions,
} from "../schema";
import { eq } from "drizzle-orm";

// In production bundle (dist/index.mjs) import.meta.url resolves to dist/.
// In dev (bun run seed-course-content.ts) it resolves to this source file's dir.
// Both cases: seed-data/courses lives one "seed-data/courses" step away.
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const COURSES_DIR = path.resolve(SCRIPT_DIR, "seed-data/courses");

// ── WP export types ───────────────────────────────────────────────────────────

interface WpAnswer {
  index: number;
  text: string;
  is_correct: boolean;
}

interface WpQuestion {
  question_id: number;
  order: number;
  type: "multi" | "open" | string;
  text: string;
  explanation?: string;
  answers?: WpAnswer[];
}

interface WpQuiz {
  quiz_id?: number;
  title?: string;
  description?: string;
  type?: string;
  pass_mark?: number;
  attempts_allowed?: number;
  show_answers?: string;
  questions?: WpQuestion[];
}

interface WpActionPlanQuestion {
  q_id: number;
  order: number;
  question: string;
}

interface WpMedia {
  youtube_video_id?: string | null;
}

interface WpUnitMeta {
  "course-unit-read"?: string;
  "course-unit-read-more"?: string;
  "course-unit-case-study"?: string;
  "course-unit-quotes"?: string;
  [key: string]: string | undefined;
}

interface WpUnit {
  unit_id: number;
  title: string;
  order: number;
  media?: WpMedia;
  meta?: WpUnitMeta;
  action_plan_questions?: WpActionPlanQuestion[];
  quiz?: WpQuiz;
}

interface WpModule {
  module_id: number;
  title: string;
  description?: string;
  order: number;
  units: WpUnit[];
}

interface WpExport {
  course: {
    course_id: number;
    title: string;
    modules: WpModule[];
  };
}

interface CardsJson {
  cpt: {
    items: Array<{
      title: string;
      status: string;
      meta: { course_id: string };
    }>;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasContent(html: string | undefined | null): html is string {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

// ── Assessment seeder ─────────────────────────────────────────────────────────

async function seedAssessment(
  courseId: string,
  wpUnit: WpUnit,
  assessmentType: "pre" | "post",
): Promise<void> {
  const quiz = wpUnit.quiz!;

  const [assessment] = await db
    .insert(assessments)
    .values({
      courseId,
      title: wpUnit.title,
      description: quiz.description || null,
      assessmentType,
      isGraded: true,
      passingScore: quiz.pass_mark ?? 70,
      showAnswers: quiz.show_answers === "on",
      maxAttempts: (quiz.attempts_allowed ?? 0) <= 0 ? 0 : quiz.attempts_allowed,
    })
    .returning({ id: assessments.id });

  const mcQuestions = (quiz.questions ?? []).filter((q) => q.type === "multi");

  for (let i = 0; i < mcQuestions.length; i++) {
    const q = mcQuestions[i];
    const options = q.answers?.map((a) => a.text) ?? [];
    const correctAnswer = Math.max(
      0,
      q.answers?.findIndex((a) => a.is_correct) ?? 0,
    );

    await db.insert(assessmentQuestions).values({
      assessmentId: assessment.id,
      questionType: "multiple-choice",
      questionText: q.text,
      options,
      correctAnswer,
      explanation: q.explanation || null,
      order: q.order ?? i,
    });
  }
}

// ── Main seeder ───────────────────────────────────────────────────────────────

export async function seedCourseContent(): Promise<void> {
  if (!fs.existsSync(COURSES_DIR)) {
    throw new Error(`Courses directory not found at ${COURSES_DIR}`);
  }

  // Build WP course_id → title map (published only) from cpt-cards.json
  const cardsPath = path.resolve(SCRIPT_DIR, "seed-data/cpt-cards.json");
  const cards: CardsJson = JSON.parse(fs.readFileSync(cardsPath, "utf-8"));
  const wpIdToTitle = new Map<number, string>();
  for (const card of cards.cpt.items) {
    if (card.status === "publish") {
      wpIdToTitle.set(parseInt(card.meta.course_id, 10), card.title);
    }
  }

  // Build title → DB course UUID map
  const allCourses = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses);
  const titleToDbId = new Map<string, string>();
  for (const c of allCourses) titleToDbId.set(c.title, c.id);

  // Get all course folders
  const folders = fs.readdirSync(COURSES_DIR).filter((f) =>
    fs.existsSync(path.join(COURSES_DIR, f, "course.json")),
  );

  console.log(`[seed-course-content] ${folders.length} course folders found`);

  let seeded = 0;
  let skipped = 0;

  for (const folder of folders) {
    // Parse WP course_id from folder name: course-15-24-minute-accounting
    const m = folder.match(/course-(\d+)-/);
    if (!m) { skipped++; continue; }
    const wpCourseId = parseInt(m[1], 10);

    const title = wpIdToTitle.get(wpCourseId);
    if (!title) { skipped++; continue; }

    const dbCourseId = titleToDbId.get(title);
    if (!dbCourseId) {
      console.log(`[skip] "${title}" not found in DB`);
      skipped++;
      continue;
    }

    // Wipe existing content (cascade handles units, blocks, questions)
    await db.delete(modules).where(eq(modules.courseId, dbCourseId));
    await db.delete(assessments).where(eq(assessments.courseId, dbCourseId));

    const wpExport: WpExport = JSON.parse(
      fs.readFileSync(path.join(COURSES_DIR, folder, "course.json"), "utf-8"),
    );
    const wpCourse = wpExport.course;

    // Pre-assessment from quiz_noblock units
    const allUnits = wpCourse.modules.flatMap((mod) => mod.units);
    const noblockUnits = allUnits.filter(
      (u) => u.quiz?.type === "quiz_noblock" && (u.quiz.questions?.length ?? 0) > 0,
    );
    if (noblockUnits.length > 0) {
      await seedAssessment(dbCourseId, noblockUnits[0], "pre");
    }

    let totalUnits = 0;
    let totalBlocks = 0;

    for (let mIdx = 0; mIdx < wpCourse.modules.length; mIdx++) {
      const wpMod = wpCourse.modules[mIdx];

      const [dbModule] = await db
        .insert(modules)
        .values({
          courseId: dbCourseId,
          title: wpMod.title,
          description: wpMod.description || null,
          order: wpMod.order ?? mIdx,
        })
        .returning({ id: modules.id });

      const lessonUnits = wpMod.units.filter(
        (u) => u.quiz?.type !== "quiz_noblock",
      );

      for (let uIdx = 0; uIdx < lessonUnits.length; uIdx++) {
        const wpUnit = lessonUnits[uIdx];

        const [dbUnit] = await db
          .insert(units)
          .values({
            moduleId: dbModule.id,
            title: wpUnit.title,
            order: wpUnit.order ?? uIdx,
          })
          .returning({ id: units.id });

        totalUnits++;
        let blockOrder = 0;

        const ytId = wpUnit.media?.youtube_video_id;
        if (ytId) {
          await db.insert(learningBlocks).values({
            unitId: dbUnit.id,
            type: "video",
            title: "Video",
            videoUrl: `https://www.youtube.com/watch?v=${ytId}`,
            order: blockOrder++,
          });
          totalBlocks++;
        }

        const textSections = [
          { key: "course-unit-read" as const, label: "Read" },
          { key: "course-unit-read-more" as const, label: "Read More" },
          { key: "course-unit-case-study" as const, label: "Case Study" },
          { key: "course-unit-quotes" as const, label: "Quotes" },
        ] as const;

        for (const { key, label } of textSections) {
          const html = wpUnit.meta?.[key];
          if (hasContent(html)) {
            await db.insert(learningBlocks).values({
              unitId: dbUnit.id,
              type: "text",
              title: label,
              body: html,
              order: blockOrder++,
            });
            totalBlocks++;
          }
        }

        const apQuestions = wpUnit.action_plan_questions ?? [];
        if (apQuestions.length > 0) {
          const [apBlock] = await db
            .insert(learningBlocks)
            .values({
              unitId: dbUnit.id,
              type: "question",
              title: "Action Plan",
              order: blockOrder++,
            })
            .returning({ id: learningBlocks.id });
          totalBlocks++;

          for (let qIdx = 0; qIdx < apQuestions.length; qIdx++) {
            const q = apQuestions[qIdx];
            await db.insert(blockQuestions).values({
              blockId: apBlock.id,
              kind: "action-plan",
              format: "short-text",
              prompt: q.question,
              order: q.order ?? qIdx,
            });
          }
        }

        const quiz = wpUnit.quiz;
        if (quiz?.type === "survey" && (quiz.questions?.length ?? 0) > 0) {
          const [surveyBlock] = await db
            .insert(learningBlocks)
            .values({
              unitId: dbUnit.id,
              type: "question",
              title: quiz.title || "Quiz",
              order: blockOrder++,
            })
            .returning({ id: learningBlocks.id });
          totalBlocks++;

          for (let qIdx = 0; qIdx < quiz.questions!.length; qIdx++) {
            const q = quiz.questions![qIdx];
            const isMulti = q.type === "multi";
            const options = isMulti ? (q.answers?.map((a) => a.text) ?? null) : null;
            const correctIndex =
              isMulti && q.answers ? q.answers.findIndex((a) => a.is_correct) : null;

            await db.insert(blockQuestions).values({
              blockId: surveyBlock.id,
              kind: "survey",
              format: isMulti ? "multiple-choice" : "short-text",
              prompt: q.text,
              options: options?.length ? options : null,
              correctIndex: correctIndex !== null && correctIndex >= 0 ? correctIndex : null,
              order: q.order ?? qIdx,
            });
          }
        }
      }
    }

    console.log(
      `[seeded] "${title}" — modules=${wpCourse.modules.length}, units=${totalUnits}, blocks=${totalBlocks}`,
    );
    seeded++;
  }

  console.log(
    `\n[seed-course-content] Done. Seeded=${seeded}, Skipped=${skipped}`,
  );
}

// @ts-ignore
if (import.meta.main) {
  seedCourseContent()
    .catch((err) => {
      console.error("[seed-course-content] Error:", err);
      process.exit(1);
    })
    .finally(() => pool.end());
}
