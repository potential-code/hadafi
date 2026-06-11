import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import stakeholdersRouter from "./stakeholders";
import adminRouter from "./admin";
import mentorRouter from "./mentor";
import lmsRouter from "./lms";
import mediaRouter from "./media";
import offersRouter from "./offers";
import smeRouter from "./sme";
import liveEventsRouter from "./liveEvents";
import aiToolsRouter from "./aiTools";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/stakeholders", stakeholdersRouter);
router.use("/admin", adminRouter);
router.use("/mentor", mentorRouter);
router.use("/lms", lmsRouter);
router.use("/media", mediaRouter);
router.use("/live-events", liveEventsRouter);
router.use("/offers", offersRouter);
router.use("/ai-tools", aiToolsRouter);
// SME routes: /api/mentors/* and /api/sessions/* — no sub-prefix, paths defined in sme.ts
router.use(smeRouter);

export default router;
