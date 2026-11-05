import { Router, type IRouter } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import { perUser, HOUR, MINUTE } from "../middleware/limits";
import * as org from "../controllers/organisations.controller";
import { ORGANISATION_TYPES, PARTNER_ROLE } from "../services/organisations.service";

/**
 * Organisations and partner logins (SMEEP db40881, 68d8fd4, f31dd6e).
 * Four routers, mounted in routes/index.ts:
 * - /api/admin/organisations: admins manage organisations, learners, partner logins
 * - /api/partner: a partner's own organisation only (dashboard, participants, exports)
 * - /api/organisations: public, what a sign-up link joins
 * - /api/me/organisation: a learner's own organisation, and leaving it
 */

// ── Admin ────────────────────────────────────────────────────────────────────

export const adminOrganisationsRouter: IRouter = Router();
adminOrganisationsRouter.use(authenticate, requireRole("admin"));

const organisationDto = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(ORGANISATION_TYPES),
});
const organisationPatchDto = z
  .object({ name: z.string().trim().min(2).max(120), type: z.enum(ORGANISATION_TYPES), joinEnabled: z.boolean() })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to change" });
const addLearnersDto = z.object({ emails: z.array(z.string().trim().email().max(254)).min(1).max(500) });
const invitePartnerDto = z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(254) });

const adminExportLimit = perUser("admin-org-exports", HOUR, 120, "That is a lot of exports in one hour. Please try again later.");

adminOrganisationsRouter.get("/", org.list);
adminOrganisationsRouter.post("/", validate(organisationDto), org.create);
adminOrganisationsRouter.patch("/:id", validate(organisationPatchDto), org.update);
adminOrganisationsRouter.post("/:id/join-code", org.regenerateCode);
adminOrganisationsRouter.delete("/:id", org.archive);
adminOrganisationsRouter.get("/:id/dashboard", org.dashboard);
adminOrganisationsRouter.get("/:id/exports/:dataset", adminExportLimit, org.adminExport);
adminOrganisationsRouter.post("/:id/learners", validate(addLearnersDto), org.addLearners);
adminOrganisationsRouter.get("/:id/learners/:userId", org.adminParticipant);
adminOrganisationsRouter.delete("/:id/learners/:userId", org.removeLearner);
adminOrganisationsRouter.get("/:id/partners", org.partners);
adminOrganisationsRouter.post("/:id/partners", validate(invitePartnerDto), org.invitePartner);
adminOrganisationsRouter.delete("/:id/partners/:userId", org.removePartner);

// ── Partner ──────────────────────────────────────────────────────────────────

export const partnerRouter: IRouter = Router();
partnerRouter.use(authenticate, requireRole(PARTNER_ROLE));

partnerRouter.get("/dashboard", org.partnerDashboard);
partnerRouter.get("/learners/:userId", perUser("partner-record", MINUTE, 60), org.partnerParticipant);
partnerRouter.get("/exports/:dataset", perUser("partner-export", MINUTE, 10), org.partnerExport);

// ── Public ───────────────────────────────────────────────────────────────────

export const publicOrganisationsRouter: IRouter = Router();

const lookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: process.env["NODE_ENV"] === "test" ? 10_000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many tries. Wait a few minutes and try again.", code: "RATE_LIMITED" } },
});

publicOrganisationsRouter.get("/join/:code", lookupLimiter, org.joinInfo);

// ── The learner's own ────────────────────────────────────────────────────────

export const meOrganisationRouter: IRouter = Router();
meOrganisationRouter.use(authenticate);

meOrganisationRouter.get("/", org.mine);
meOrganisationRouter.post("/leave", org.leave);
