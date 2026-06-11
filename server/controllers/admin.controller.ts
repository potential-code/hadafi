import type { Request, Response, NextFunction } from "express";
import * as adminService from "../services/admin.service";

/**
 * POST /api/admin/invites
 *
 * Creates a new invite code. The authenticated user must be an admin.
 * Returns 201 with the generated invite code and its fully-formed link.
 */
export async function createInvite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.user is guaranteed by the authenticate + requireRole('admin') chain.
    const adminUserId = req.user!.userId; // ! safe: authenticate middleware guarantees it
    const invite = await adminService.createInvite(adminUserId);
    res.status(201).json({ success: true, data: invite });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/invites
 *
 * Returns all invite codes with optional nested info about the user who
 * redeemed each code (null when unredeemed).
 */
export async function listInvites(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const invites = await adminService.listInvites();
    res.status(200).json({ success: true, data: invites });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/mentor-applications
 *
 * Returns mentor applications, optionally filtered by status via `?status=`.
 * Accepts any string value; invalid values will simply return an empty array
 * rather than an error — filtering is a convenience, not a constraint.
 */
export async function listMentorApplications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // status is an optional query string filter — coerce to string or undefined.
    const status =
      typeof req.query["status"] === "string" ? req.query["status"] : undefined;

    const applications = await adminService.listMentorApplications(status);
    res.status(200).json({ success: true, data: applications });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/mentor-applications/:id/approve
 *
 * Approves a pending mentor application, generates a setup token, and
 * dispatches an approval email to the applicant.
 */
export async function approveMentorApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await adminService.approveMentorApplication(req.params["id"] as string);
    res.status(200).json({ success: true, data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/mentor-applications/:id/reject
 *
 * Rejects a mentor application by updating its status to 'rejected'.
 */
export async function rejectMentorApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await adminService.rejectMentorApplication(req.params["id"] as string);
    res.status(200).json({ success: true, data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/stakeholder-applications
 *
 * Returns stakeholder registrations, optionally filtered by type via `?type=`.
 * Accepts any string value; invalid values will simply return an empty array.
 */
export async function listStakeholderApplications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const type =
      typeof req.query["type"] === "string" ? req.query["type"] : undefined;
    const applications = await adminService.listStakeholderApplications(type);
    res.status(200).json({ success: true, data: applications });
  } catch (err) {
    next(err);
  }
}
