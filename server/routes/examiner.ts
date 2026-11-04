import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import { perUser, MINUTE, HOUR, DAY } from "../middleware/limits";
import { AppError } from "../utils/app-error";
import {
  buildCourseReference,
  createAnamSessionToken,
  EXAM_MODES,
  getExamineeProfile,
  listAttempts,
  listExaminableCourses,
  saveAttempt,
} from "../services/examiner.service";

/**
 * The AI Examiner (ported from SMEEP), mounted at /api/ai:
 * - GET  /examiner/profile                      who is being examined
 * - GET  /examiner/courses                      published courses she is enrolled in
 * - GET  /examiner/courses/:courseId/reference  the condensed course (the examiner's syllabus)
 * - GET  /examiner/attempts?limit=              her own attempts, newest first
 * - POST /examiner/attempts                     mark (on the server) and store a finished exam
 * - POST /anam/session-token                    a video-mode avatar session
 *
 * Signed-in learners, mentors and admins (the roles that get a Hana token);
 * every exam endpoint also needs a published course the caller is enrolled in.
 */
const router: IRouter = Router();
const examinerRoles = requireRole("sme", "mentor", "admin");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

// Each marking is a model call: 10 an hour, 30 a day (SMEEP's limits).
const markLimits = [
  perUser("examiner-attempt", HOUR, 10, "You have taken a lot of exams in the last hour. Please try again later."),
  perUser("examiner-attempt-day", DAY, 30, "You have reached today's exam limit. Please come back tomorrow."),
];
// Each video session is billed per minute: 5 per 10 minutes, 20 a day.
const videoLimits = [
  perUser("anam-session", 10 * MINUTE, 5, "Please wait a few minutes before starting another video exam."),
  perUser("anam-session-day", DAY, 20, "You have reached today's video exam limit. Text and voice exams are still open."),
];

const attemptDto = z.object({
  courseId: z.string().uuid(),
  mode: z.enum(EXAM_MODES),
  scenario: z.string().max(300).optional(),
  threadId: z.string().min(1).max(128),
  // Anything else (a score, a scorecard, a transcript) is dropped by the parse.
});

router.get(
  "/examiner/profile",
  authenticate,
  examinerRoles,
  wrap(async (req, res) => {
    res.json({ success: true, data: await getExamineeProfile(req.user!.userId) });
  }),
);

router.get(
  "/examiner/courses",
  authenticate,
  examinerRoles,
  wrap(async (req, res) => {
    res.json({ success: true, data: await listExaminableCourses(req.user!.userId) });
  }),
);

router.get(
  "/examiner/courses/:courseId/reference",
  authenticate,
  examinerRoles,
  wrap(async (req, res) => {
    const courseId = String(req.params["courseId"] ?? "");
    if (!UUID_RE.test(courseId)) throw new AppError("Course not found", 404, "COURSE_NOT_FOUND");
    res.json({ success: true, data: await buildCourseReference(req.user!.userId, courseId) });
  }),
);

router.get(
  "/examiner/attempts",
  authenticate,
  examinerRoles,
  wrap(async (req, res) => {
    const limit = Number.parseInt(String(req.query["limit"] ?? "10"), 10);
    res.json({ success: true, data: await listAttempts(req.user!.userId, Number.isNaN(limit) ? 10 : limit) });
  }),
);

router.post(
  "/examiner/attempts",
  authenticate,
  examinerRoles,
  ...markLimits,
  validate(attemptDto),
  wrap(async (req, res) => {
    res.status(201).json({ success: true, data: await saveAttempt(req.user!.userId, req.body) });
  }),
);

router.post(
  "/anam/session-token",
  authenticate,
  examinerRoles,
  ...videoLimits,
  wrap(async (_req, res) => {
    res.json({ success: true, data: await createAnamSessionToken() });
  }),
);

export default router;
