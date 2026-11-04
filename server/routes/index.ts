import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountRouter from "./account";
import stakeholdersRouter from "./stakeholders";
import adminRouter from "./admin";
import adminReportsRouter from "./adminReports";
import mentorRouter from "./mentor";
import lmsRouter from "./lms";
import mediaRouter from "./media";
import offersRouter from "./offers";
import smeRouter from "./sme";
import liveEventsRouter from "./liveEvents";
import aiToolsRouter from "./aiTools";
import meRouter from "./me";
import achievementsRouter from "./achievements";
import notificationsRouter from "./notifications";
import aiMentorsRouter from "./aiMentors";
import publicRouter from "./public";
import aiAnalyticsRouter from "./aiAnalytics";
import { adminAnnouncementsRouter, myAnnouncementsRouter, publicAnnouncementsRouter } from "./announcements";
import { aiReportsRouter, adminAiReportsRouter } from "./aiReports";
import { adminOrganisationsRouter, meOrganisationRouter, partnerRouter, publicOrganisationsRouter } from "./organisations";

const router: IRouter = Router();

router.use(healthRouter);
// Sign-in and sessions live at /api/auth/* (Better Auth, mounted in index.ts).
router.use("/account", accountRouter);
router.use("/stakeholders", stakeholdersRouter);
// Announcements and AI safety review guard themselves (admins only), so they sit before /admin.
router.use("/admin/announcements", adminAnnouncementsRouter);
router.use("/admin/ai-reports", adminAiReportsRouter);
router.use("/admin/organisations", adminOrganisationsRouter);
router.use("/admin/ai", aiAnalyticsRouter);
router.use("/admin", adminRouter);
router.use("/admin", adminReportsRouter);
router.use("/mentor", mentorRouter);
router.use("/lms", lmsRouter);
router.use("/media", mediaRouter);
router.use("/live-events", liveEventsRouter);
router.use("/offers", offersRouter);
router.use("/ai-tools", aiToolsRouter);
router.use("/me/notifications", notificationsRouter);
router.use("/me/announcements", myAnnouncementsRouter);
router.use("/me/organisation", meOrganisationRouter);
router.use("/me", meRouter);
router.use("/me", achievementsRouter);
router.use("/ai-mentors", aiMentorsRouter);
router.use("/public", publicRouter);
router.use("/announcements", publicAnnouncementsRouter);
router.use("/ai-reports", aiReportsRouter);
router.use("/organisations", publicOrganisationsRouter);
router.use("/partner", partnerRouter);
// SME routes: /api/mentors/* and /api/sessions/* — no sub-prefix, paths defined in sme.ts
router.use(smeRouter);

export default router;
