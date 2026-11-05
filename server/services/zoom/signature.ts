import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proving a webhook came from Zoom. The signature covers the raw body, which
 * is why the webhook route is mounted before express.json().
 */

/** A signed request older than this is refused, so a captured one can't be replayed. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const hmac = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");

/** The answer to Zoom's endpoint.url_validation challenge. */
export function urlValidationResponse(secret: string, plainToken: string) {
  return { plainToken, encryptedToken: hmac(secret, plainToken) };
}

export function verifyWebhookSignature(input: {
  secret: string;
  rawBody: string;
  signature: string | undefined;
  timestamp: string | undefined;
  now?: number;
}): boolean {
  const { secret, rawBody, signature, timestamp, now = Date.now() } = input;
  // No secret means no webhook, not an open endpoint.
  if (!secret || !signature || !timestamp) return false;
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > SIGNATURE_TOLERANCE_MS) return false;
  const expected = Buffer.from(`v0=${hmac(secret, `v0:${timestamp}:${rawBody}`)}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
