import type { Request, Response, NextFunction } from "express";
import * as stakeholdersService from "../services/stakeholders.service";

/**
 * POST /api/stakeholders/expert
 *
 * Registers an expert (mentor) application. Public — no auth required.
 * On success, returns 201 with { ok: true }.
 */
export async function registerExpert(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, email, linkedin, hourlyRate, expertise, methods, passion } = req.body as {
      name: string;
      email: string;
      linkedin: string;
      hourlyRate: number;
      expertise: string[];
      methods: string[];
      passion: string;
    };

    const result = await stakeholdersService.registerExpert({
      name,
      email,
      linkedin,
      hourlyRate,
      expertise,
      methods,
      passion,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/stakeholders/organisation
 *
 * Registers an organisation stakeholder (VC, government, corporate, university,
 * incubator). Public — no auth required.
 * On success, returns 201 with { ok: true }.
 */
export async function registerOrganisation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { type, fullName, title, email, country, website, phone, representing, involvement } =
      req.body as {
        type: string;
        fullName: string;
        title: string;
        email: string;
        country: string;
        website: string;
        phone: string;
        representing: string;
        involvement: string[];
      };

    const result = await stakeholdersService.registerOrganisation({
      type,
      fullName,
      title,
      email,
      country,
      website,
      phone,
      representing,
      involvement,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
