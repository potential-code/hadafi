import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { eq } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "../db";
import { users } from "../db/schema";

/** Shape attached to `req.user` once the request's session is confirmed. */
export interface AuthUser {
  userId: string;
  role: string;
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
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  } catch {
    session = null;
  }
  if (!session) {
    res.status(401).json({ success: false, error: { message: "Please sign in to continue.", code: "UNAUTHORIZED" } });
    return;
  }

  let row: { role: string } | undefined;
  try {
    [row] = await db
      .update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, session.user.id))
      .returning({ role: users.role });
  } catch (err) {
    next(err);
    return;
  }
  // The account was deleted while a cached session was still around.
  if (!row) {
    res.status(401).json({ success: false, error: { message: "Please sign in to continue.", code: "UNAUTHORIZED" } });
    return;
  }

  req.user = { userId: session.user.id, role: row.role };
  next();
}
