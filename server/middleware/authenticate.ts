import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { eq } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "../db";
import { users } from "../db/schema";
import { logger } from "../config/logger";
import {
  authenticateOperatorKey,
  isOperatorServiceUser,
  isUnambiguousTarget,
  operatorKeyAllowedFor,
  operatorKeysEnabled,
  readBearer,
  requestPathname,
} from "../auth/operatorKeys";
import { operatorRouteAllowed, routeShape } from "../auth/operatorScope";
import { auditActorKnown } from "./audit-log";

/** Shape attached to `req.user` once the request's session is confirmed. */
export interface AuthUser {
  userId: string;
  role: string;
  /** How the request was authenticated; absent means a session cookie. */
  via?: "session" | "operator_key";
  /** The operator key's label (OPERATOR_API_KEYS) when `via` is "operator_key". */
  keyLabel?: string;
}

// Extend Express Request so downstream handlers can access req.user without
// casting. Declaration merging lives in the same file to keep it co-located
// with the middleware that sets it.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's own type augmentation point
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const unauthorized = (res: Response): void => {
  res.status(401).json({ success: false, error: { message: "Please sign in to continue.", code: "UNAUTHORIZED" } });
};

/**
 * Session authentication middleware.
 *
 * Reads the Better Auth session from the request's cookie and attaches
 * `{ userId, role }` to `req.user`. Responds 401 when there is no valid
 * session. Only verified accounts ever hold a session.
 *
 * The role is read from the users row on every request, not from the session
 * (whose copy can be up to 5 minutes old through the cookie cache), so a
 * demotion or promotion takes effect on the very next request. The same
 * query records lastActiveAt, so it costs no extra round trip.
 *
 * Operator keys: when OPERATOR_API_KEYS is set, an `Authorization: Bearer`
 * header on an app route is checked instead of the cookie and, if it is a
 * valid key, the request acts as the admin service account
 * (OPERATOR_SERVICE_USER_EMAIL). A Bearer header that is not a valid key is a
 * 401, whatever cookie comes with it. A valid key reaches only the routes in
 * auth/operatorScope.ts; any other route is a 403. See auth/operatorKeys.ts
 * and docs/operator-access.md.
 *
 * Whoever is authenticated, the audit log is told as soon as req.user is set
 * (auditActorKnown), so a caller hanging up mid-request is still recorded.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bearer = readBearer(req);
  if (bearer !== null && operatorKeysEnabled() && operatorKeyAllowedFor(req)) {
    let result: Awaited<ReturnType<typeof authenticateOperatorKey>>;
    try {
      result = await authenticateOperatorKey(bearer);
    } catch (err) {
      logger.error({ err }, "[operator-keys] key check failed");
      result = { ok: false, reason: "no_service_user" };
    }
    const pathname = requestPathname(req) ?? "";
    if (!result.ok) {
      logger.warn({ reason: result.reason, method: req.method, path: routeShape(pathname) }, "[operator-keys] refused a Bearer request");
      unauthorized(res);
      return;
    }
    req.user = { userId: result.userId, role: result.role, via: "operator_key", keyLabel: result.keyLabel };
    auditActorKnown(res);
    // The key is genuine; now the route must be one the operator MCP uses.
    // Refused attempts are still audited (the actor is known).
    if (!isUnambiguousTarget(req) || !operatorRouteAllowed(req.method, pathname)) {
      console.warn(`[operator-scope] refused ${req.method} ${routeShape(pathname)} for operator key "${result.keyLabel}": not in auth/operatorScope.ts`);
      res.status(403).json({ success: false, error: { message: "The operator key may not use this endpoint.", code: "FORBIDDEN" } });
      return;
    }
    db.update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, result.userId))
      .catch(() => {});
    next();
    return;
  }

  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  } catch {
    session = null;
  }
  // Partner logins can be removed by an admin at any moment; don't let the
  // 5-minute cookie cache keep a revoked partner session in. Confirm it with
  // the database (SMEEP f31dd6e).
  if (session?.user.role === "partner") {
    try {
      session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers), query: { disableCookieCache: true } });
    } catch {
      session = null;
    }
  }
  if (!session) {
    unauthorized(res);
    return;
  }

  let row: { role: string; email: string; fullName: string } | undefined;
  try {
    [row] = await db
      .update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, session.user.id))
      .returning({ role: users.role, email: users.email, fullName: users.fullName });
  } catch (err) {
    next(err);
    return;
  }
  // The account was deleted while a cached session was still around. And the
  // operator service account works only through its keys: a browser session
  // for it (however it was obtained) is refused, by address or by the
  // operator name, read from the row (never from the cached session).
  if (!row || isOperatorServiceUser({ email: row.email, name: row.fullName })) {
    unauthorized(res);
    return;
  }

  req.user = { userId: session.user.id, role: row.role, via: "session" };
  auditActorKnown(res);
  next();
}
