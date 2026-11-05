import express, { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { liveEvents } from "../db/schema";
import { urlValidationResponse, verifyWebhookSignature } from "../services/zoom";
import { syncAttendance } from "../services/eventZoom.service";
import { logger } from "../config/logger";

/**
 * POST /api/webhooks/zoom — Zoom tells Hadafi when a meeting starts and ends.
 * The only unauthenticated write route: trusted on Zoom's signature alone
 * (ZOOM_WEBHOOK_SECRET_TOKEN), so it is mounted with the raw body, before
 * express.json(). Subscribe to meeting.started and meeting.ended.
 */
const router: IRouter = Router();

router.post("/", express.raw({ type: "application/json", limit: "1mb" }), async (req: Request, res: Response) => {
  const secret = process.env["ZOOM_WEBHOOK_SECRET_TOKEN"] ?? "";
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const ok = verifyWebhookSignature({
    secret,
    rawBody,
    signature: req.header("x-zm-signature") ?? undefined,
    timestamp: req.header("x-zm-request-timestamp") ?? undefined,
  });
  if (!ok) {
    res.status(401).json({ success: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    return;
  }
  let body: { event?: string; payload?: { plainToken?: string; object?: { id?: string | number; uuid?: string } } };
  try {
    body = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ success: false, error: { message: "Bad request", code: "BAD_REQUEST" } });
    return;
  }

  if (body.event === "endpoint.url_validation" && body.payload?.plainToken) {
    res.json(urlValidationResponse(secret, body.payload.plainToken));
    return;
  }

  const meetingId = body.payload?.object?.id != null ? String(body.payload.object.id) : null;
  try {
    if (meetingId && body.event === "meeting.started") {
      await db.update(liveEvents).set({ zoomStartedAt: new Date(), zoomEndedAt: null }).where(eq(liveEvents.zoomMeetingId, meetingId));
    } else if (meetingId && body.event === "meeting.ended") {
      const [event] = await db
        .update(liveEvents)
        .set({ zoomEndedAt: new Date(), zoomLastMeetingUuid: body.payload?.object?.uuid ?? null, attendanceSyncedAt: null })
        .where(eq(liveEvents.zoomMeetingId, meetingId))
        .returning({ id: liveEvents.id });
      // Zoom's report usually needs a few minutes; the sweep retries if it isn't ready.
      if (event) setTimeout(() => void syncAttendance(event.id), 5 * 60_000).unref();
    }
  } catch (err) {
    logger.error({ err, event: body.event }, "[zoom] webhook handling failed");
  }
  // Always 200 once verified, so Zoom doesn't retry something it can't fix.
  res.json({ success: true });
});

export default router;
