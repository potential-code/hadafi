import type { Request, Response, NextFunction } from "express";
import * as svc from "../services/organisations.service";
import { participantRecord } from "../services/participantRecord.service";
import { buildExport, ORGANISATION_DATASETS, type ExportDataset } from "../services/admin.exports.service";

/** Organisations: the admin area, the partner portal, the public sign-up link and the learner's own. */

type Handler<P = Record<string, string>> = (req: Request<P>, res: Response, next: NextFunction) => Promise<void>;
const wrap =
  <P = Record<string, string>>(fn: (req: Request<P>, res: Response) => Promise<unknown>): Handler<P> =>
  async (req, res, next) => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

/** "Ministry of Economy" → "ministry-of-economy" for download filenames. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "organisation";

async function sendExport(req: Request<{ dataset: string }>, res: Response, organisationId: string): Promise<void> {
  const dataset = req.params.dataset as ExportDataset;
  if (!(ORGANISATION_DATASETS as readonly string[]).includes(dataset)) {
    res.status(404).json({ success: false, error: { message: "Unknown export", code: "NOT_FOUND" } });
    return;
  }
  const org = await svc.getOrganisation(organisationId);
  const file = await buildExport(dataset, req.query["format"] === "csv" ? "csv" : "xlsx", { organisationId, filePrefix: slug(org.name) });
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Row-Count", String(file.rows));
  res.status(200).send(file.body);
}

// ── Admin ────────────────────────────────────────────────────────────────────

export const list = wrap(() => svc.listOrganisations());
export const create = wrap(async (req, res) => {
  res.status(201);
  return svc.createOrganisation(req.user!.userId, req.body as { name: string; type: svc.OrganisationType });
});
export const update = wrap<{ id: string }>((req) => svc.updateOrganisation(req.params.id, req.body as Parameters<typeof svc.updateOrganisation>[1]));
export const regenerateCode = wrap<{ id: string }>((req) => svc.regenerateJoinCode(req.params.id));
export const archive = wrap<{ id: string }>(async (req) => {
  await svc.archiveOrganisation(req.params.id);
  return { ok: true };
});
export const dashboard = wrap<{ id: string }>((req) => svc.organisationDashboard(req.params.id));
export const addLearners = wrap<{ id: string }>((req) => svc.addLearnersByEmail(req.params.id, (req.body as { emails: string[] }).emails));
export const removeLearner = wrap<{ id: string; userId: string }>(async (req) => {
  await svc.getOrganisation(req.params.id);
  await svc.removeLearner(req.params.id, req.params.userId);
  return { ok: true };
});
export const partners = wrap<{ id: string }>((req) => svc.listPartners(req.params.id));
export const invitePartner = wrap<{ id: string }>(async (req, res) => {
  const contact = await svc.invitePartner(req.params.id, req.body as { fullName: string; email: string });
  res.status(201);
  return contact;
});
export const removePartner = wrap<{ id: string; userId: string }>(async (req) => {
  await svc.getOrganisation(req.params.id);
  await svc.removePartner(req.params.id, req.params.userId);
  return { ok: true };
});
export const adminExport: Handler<{ id: string; dataset: string }> = async (req, res, next) => {
  try {
    await sendExport(req as unknown as Request<{ dataset: string }>, res, (await svc.getOrganisation(req.params.id)).id);
  } catch (err) {
    next(err);
  }
};

/** GET /api/admin/organisations/:id/learners/:userId: one participant's full record. */
export const adminParticipant = wrap<{ id: string; userId: string }>(async (req) => {
  const org = await svc.getOrganisation(req.params.id);
  return participantRecord(org.id, req.params.userId);
});

// ── Partner (their own organisation only) ────────────────────────────────────
// The organisation always comes from the partner's own users row, never from
// the request, so no id in a URL can reach another organisation.

export const partnerDashboard = wrap(async (req) => svc.organisationDashboard(await svc.partnerOrganisationId(req.user!.userId)));

/** GET /api/partner/learners/:userId: one of their own participants' full record (404 for anyone else). */
export const partnerParticipant = wrap<{ userId: string }>(async (req) =>
  participantRecord(await svc.partnerOrganisationId(req.user!.userId), req.params.userId),
);

export const partnerExport: Handler<{ dataset: string }> = async (req, res, next) => {
  try {
    await sendExport(req, res, await svc.partnerOrganisationId(req.user!.userId));
  } catch (err) {
    next(err);
  }
};

// ── Public sign-up link ──────────────────────────────────────────────────────

/** GET /api/organisations/join/:code: the organisation's name for the sign-up page, or 404. */
export const joinInfo = wrap<{ code: string }>(async (req, res) => {
  const org = await svc.findJoinable(req.params.code);
  if (!org) {
    res.status(404).json({ success: false, error: { message: "This organisation link isn't active.", code: "NOT_FOUND" } });
    return;
  }
  return { name: org.name, code: org.joinCode };
});

// ── The learner's own ────────────────────────────────────────────────────────

export const mine = wrap((req) => svc.myOrganisation(req.user!.userId));
export const leave = wrap(async (req) => {
  await svc.leaveOrganisation(req.user!.userId);
  return { ok: true };
});
