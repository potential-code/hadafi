import type { Request, Response, NextFunction } from "express";
import { operatorKeyAllowedFor, operatorKeysEnabled, readBearer } from "../auth/operatorKeys";

/**
 * Cross-site request forgery guard for the app's own API.
 *
 * Every state-changing /api request (POST, PUT, PATCH, DELETE) must come from
 * the site itself: its Origin header, or failing that its Referer, must be the
 * site's origin (FRONTEND_URL, and BETTER_AUTH_URL when it differs). Anything
 * else, including a request with neither header, is a 403. Browsers send
 * Origin on every such request, and the site's /api is the same origin, so
 * real users never see it; another site's form or script posting with a
 * learner's cookie does.
 *
 * Not checked here (mounted before this in index.ts, or exempted below):
 * - /api/auth/*: Better Auth checks the origin of its own requests
 *   (trustedOrigins in auth/index.ts).
 * - /api/webhooks/zoom and /api/webhooks/stripe: called by Zoom and Stripe,
 *   which send no Origin; each checks its sender's signature instead.
 * - Operator keys (Authorization: Bearer, when OPERATOR_API_KEYS is set):
 *   server-to-server, no cookie involved, and a browser on another site
 *   can't add that header without a CORS preflight, which CORS refuses.
 *   authenticate() refuses any Bearer value that isn't a valid key.
 */

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const originOf = (value: string | undefined | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
};

/** The site's own origins, read per request so tests and deploys can change them. */
export function allowedOrigins(env: Record<string, string | undefined> = process.env): Set<string> {
  const origins = new Set<string>();
  // `||`: compose passes unset variables as "".
  for (const value of [env["FRONTEND_URL"] || "http://localhost:3000", env["BETTER_AUTH_URL"]]) {
    const origin = originOf(value);
    if (origin) origins.add(origin);
  }
  return origins;
}

/** The origin a request says it came from: Origin, or the Referer's origin when Origin is absent. */
export function requestOrigin(req: Pick<Request, "headers">): string | null {
  const origin = req.headers["origin"];
  if (typeof origin === "string" && origin !== "") return originOf(origin);
  const referer = req.headers["referer"];
  return typeof referer === "string" ? originOf(referer) : null;
}

const isOperatorKeyRequest = (req: Request): boolean =>
  readBearer(req) !== null && operatorKeysEnabled() && operatorKeyAllowedFor(req);

export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(req.method) || isOperatorKeyRequest(req)) {
    next();
    return;
  }
  const origin = requestOrigin(req);
  if (origin !== null && allowedOrigins().has(origin)) {
    next();
    return;
  }
  res.status(403).json({
    success: false,
    error: { message: "This request must come from the Hadafi site.", code: "FORBIDDEN_ORIGIN" },
  });
}
