import { ZoomMockAdapter } from "./mock";
import { ZoomS2SAdapter } from "./s2s";
import { zoomCredentials } from "./http";
import type { ZoomProvider } from "./types";

/**
 * The one way Hadafi talks to Zoom. Real Zoom when the credentials are set;
 * otherwise the in-memory mock, except in production, where a missing setup
 * means "Zoom isn't connected" rather than fake links.
 */
function select(): { provider: ZoomProvider | null; configured: boolean } {
  // Tests never touch a real Zoom account, whatever is in .env; ZOOM_ADAPTER=mock
  // does the same for local development with real credentials present.
  if (process.env["NODE_ENV"] === "test" || process.env["ZOOM_ADAPTER"] === "mock") {
    return { provider: new ZoomMockAdapter(), configured: true };
  }
  if (zoomCredentials() && process.env["ZOOM_HOST_USER_ID"]) return { provider: new ZoomS2SAdapter(), configured: true };
  if (process.env["NODE_ENV"] === "production") return { provider: null, configured: false };
  return { provider: new ZoomMockAdapter(), configured: true };
}

const selected = select();

/** Null in production when Zoom isn't set up. */
export const zoom: ZoomProvider | null = selected.provider;

export function zoomInfo(): { configured: boolean; mock: boolean } {
  return { configured: selected.configured, mock: zoom?.kind === "mock" };
}

/** The mock, for tests. Throws if the real Zoom is selected, so a test can't create real meetings. */
export function zoomMock(): ZoomMockAdapter {
  if (!(zoom instanceof ZoomMockAdapter)) throw new Error("[zoom] zoomMock() called while real Zoom is selected.");
  return zoom;
}

export { ZoomError, zoomErrorSummary } from "./errors";
export { urlValidationResponse, verifyWebhookSignature } from "./signature";
export type { MeetingInput, Person, ZoomMeeting, ZoomProvider, ZoomRegistrant, ZoomSession } from "./types";
