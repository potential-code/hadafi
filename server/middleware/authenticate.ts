import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Shape attached to `req.user` after successful JWT verification.
 * Uses camelCase to match the JWT payload produced by auth.service.ts.
 */
export interface AuthUser {
  userId: string;
  role: string;
}

// Extend Express Request so downstream handlers can access req.user without
// casting. Declaration merging lives in the same file to keep it co-located
// with the middleware that sets it.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * JWT authentication middleware.
 *
 * Reads `Authorization: Bearer <token>` from the request header, verifies the
 * token with JWT_SECRET, and attaches `{ userId, role }` to `req.user`.
 *
 * Responds with 401 if the header is missing, malformed, or the token is
 * invalid / expired. Call `next()` only on success.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret) {
    // Startup check in index.ts should prevent this, but guard here too.
    res.status(500).json({ error: "server_misconfiguration" });
    return;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }) as {
      userId: string;
      role: string;
    };
    req.user = { userId: payload.userId, role: payload.role };
    // Fire-and-forget: update lastActiveAt without blocking the request
    db.update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, payload.userId))
      .catch(() => {}); // silently ignore DB errors — never block auth
    next();
  } catch {
    // jwt.verify throws on expired or invalid tokens — return 401 in all cases.
    res.status(401).json({ error: "unauthorized" });
  }
}
