import { Router, type IRouter } from "express";
import { z } from "zod";

import { validate } from "../middleware/validate";
import * as stakeholdersController from "../controllers/stakeholders.controller";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/**
 * Expert (mentor) registration body schema.
 * - email normalised to lowercase for consistent storage
 * - expertise and methods are arrays of at least one non-empty string
 * - hourlyRate is an integer (USD/hr) capped at 10 000 to prevent data-entry mistakes
 */
const expertDto = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().toLowerCase(),
  linkedin: z.string().url().max(500),
  hourlyRate: z.number().int().min(0).max(10000),
  expertise: z.array(z.string().min(1)).min(1).max(20),
  methods: z.array(z.string().min(1)).min(1).max(10),
  passion: z.string().min(1).max(2000).trim(),
});

/**
 * Organisation stakeholder registration body schema.
 * - type is one of the five accepted organisation categories
 * - email normalised to lowercase for consistent storage
 * - involvement is an array of at least one non-empty string (e.g. partnership types)
 */
const organisationDto = z.object({
  type: z.enum(["vc", "government", "corporate", "university", "incubator"]),
  fullName: z.string().min(1).max(200).trim(),
  title: z.string().min(1).max(200).trim(),
  email: z.string().email().toLowerCase(),
  country: z.string().min(1).max(100),
  website: z.string().url().max(500),
  phone: z.string().min(1).max(50),
  representing: z.string().min(1).max(500),
  involvement: z.array(z.string().min(1)).min(1).max(10),
});

// ---------------------------------------------------------------------------
// Routes — mounted at /api/stakeholders in routes/index.ts
// ---------------------------------------------------------------------------

/**
 * Stakeholder routes — public, no auth required.
 *
 * POST  /api/stakeholders/expert        — register as an expert / mentor
 * POST  /api/stakeholders/organisation  — register as an organisation stakeholder
 */

router.post("/expert", validate(expertDto), stakeholdersController.registerExpert);
router.post(
  "/organisation",
  validate(organisationDto),
  stakeholdersController.registerOrganisation,
);

export default router;
