import type { Request, Response, NextFunction } from "express";
import {
  getExpectedCredentials,
  isPathExempt,
  unauthorizedResponseInit,
  verifyBasicAuthHeader,
} from "../../shared/access-gate";

export function basicAuthGate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const pathname = (req.path || req.url || "/").split("?")[0] ?? "/";
  if (isPathExempt(pathname)) {
    next();
    return;
  }

  const header = req.headers["authorization"];
  if (verifyBasicAuthHeader(header ?? null, getExpectedCredentials())) {
    next();
    return;
  }

  const init = unauthorizedResponseInit();
  for (const [name, value] of Object.entries(init.headers)) {
    res.setHeader(name, value);
  }
  res.status(init.status).send("Authentication required");
}
