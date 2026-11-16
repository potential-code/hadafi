import type { Request, Response, NextFunction } from "express";

import { db } from "../db";
import { adminAuditLog, type InsertAdminAuditLogRow } from "../db/schema";
import { logger } from "../config/logger";
import { readBearer, requestPathname } from "../auth/operatorKeys";

// Admin audit log: one admin_audit_log row for
//  - every mutating request (POST, PUT, PATCH, DELETE) under /api made by an
//    admin session or with an operator key, whatever route it is, and
//  - every bulk export (an /exports path, or a download sent as an
//    attachment) fetched with an operator key.
//
// The row is written after the response has been sent and never awaited by
// the request: a failing audit write is logged and the request is unaffected.
// Who the actor is comes from req.user, which authenticate() sets further
// down the chain and then reports with auditActorKnown(res). The row is
// written when the response finishes; if the caller hangs up first, it is
// written with status 499 as soon as the actor is known (the handler may
// still go on to make the change, so the row must not be lost). That holds
// for every request on the connection, including pipelined ones.

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const REDACTED = "[redacted]";
const TRUNCATED = "[truncated]";
const MAX_STRING = 500;
const MAX_ARRAY = 50;
const MAX_KEYS = 100;
const MAX_DEPTH = 6;
const MAX_SUMMARY_CHARS = 16_000;
/** nginx's "client closed request": the caller hung up before the response was sent. */
export const CLIENT_CLOSED = 499;

// Field names whose values are never stored. Emails are kept on purpose (who
// was invited, added or removed is the point of the log).
const SECRET_NAMES = [
  /pass$/i, // pass, smtpPass
  /passw(or)?d/i,
  /pwd/i,
  /passphrase/i,
  /confirm/i, // { password, confirm } on set-password
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /(^|[-_])key$/i,
  /[a-z]Key$/,
  /authori[sz]ation/i,
  /cookie/i,
  /^otp/i,
  /^pin$/i,
  /(^|[a-z_])code$/i, // code, otpCode, verification_code, joinCode
  /credential/i,
  /signature/i,
  // Second factors, signed tokens and signatures.
  /totp/i,
  /mfa/i,
  /(recovery|backup)[-_]?codes?/i,
  /jwt/i,
  /bearer/i,
  /hmac/i,
  /(^|[-_])sig($|[-_\d])/i, // sig, webhook_sig, SIG_V2 (not signup, signal, signatory)
  /[a-z]Sig$/, // requestSig
  /private[-_]?key/i, // also privatekey, PRIVATE_KEY_PEM
  /signing[-_]?key/i,
  // Card and bank details.
  /cvv/i,
  /card[-_]?num(ber)?/i,
  /iban/i,
];

// Paths where only the field names are stored, never a value: sign-in and
// account routes (passwords, codes, tokens under any name) and what people
// write or share with the AI (AI-mentor chat, Ask Hana documents, the AI
// examiner, AI tools' business documents). Matched on the lowercased,
// normalised path.
const KEYS_ONLY_PATHS = [
  /^\/api\/(auth|account)(\/|$)/,
  /^\/api\/ai-mentors\//,
  /^\/api\/ask-hana(\/|$)/,
  /^\/api\/ai\//, // examiner attempts, Anam session (not /api/ai-reports or /api/admin/ai)
  /^\/api\/ai-tools(\/|$)/,
];

const storesKeysOnly = (path: string): boolean => {
  const p = path.toLowerCase();
  return KEYS_ONLY_PATHS.some((re) => re.test(p));
};

const isSecretName = (name: string): boolean => SECRET_NAMES.some((re) => re.test(name));

function sanitise(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…${TRUNCATED}` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return "[binary]";
  if (typeof value !== "object") return String(value);
  if (depth >= MAX_DEPTH) return TRUNCATED;
  if (Array.isArray(value)) {
    const kept = value.slice(0, MAX_ARRAY).map((v) => sanitise(v, depth + 1));
    if (value.length > MAX_ARRAY) kept.push(`[+${value.length - MAX_ARRAY} more]`);
    return kept;
  }
  const out: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [k, v] of entries.slice(0, MAX_KEYS)) {
    out[k] = isSecretName(k) ? REDACTED : sanitise(v, depth + 1);
  }
  if (entries.length > MAX_KEYS) out[TRUNCATED] = `${entries.length - MAX_KEYS} more fields`;
  return out;
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

const keysOf = (v: unknown): string[] =>
  Array.isArray(v) ? ["[array]"] : typeof v === "object" && v !== null ? Object.keys(v).slice(0, 50) : [`[${typeof v}]`];

/**
 * The stored `request_summary`: { query?, body? } with secrets redacted and
 * sizes capped, or { queryKeys?, bodyKeys? } (names only) on the keys-only
 * paths. Null when there is nothing to keep.
 */
export function summariseRequest(query: unknown, body: unknown, path = ""): Record<string, unknown> | null {
  const summary: Record<string, unknown> = {};
  if (storesKeysOnly(path)) {
    if (!isEmpty(query)) summary["queryKeys"] = keysOf(query);
    if (!isEmpty(body)) summary["bodyKeys"] = keysOf(body);
    return Object.keys(summary).length ? summary : null;
  }
  if (!isEmpty(query)) summary["query"] = sanitise(query, 0);
  if (!isEmpty(body)) summary["body"] = sanitise(body, 0);
  if (Object.keys(summary).length === 0) return null;
  const size = JSON.stringify(summary).length;
  if (size > MAX_SUMMARY_CHARS) {
    return {
      [TRUNCATED]: true,
      chars: size,
      ...(summary["query"] ? { queryKeys: Object.keys(summary["query"] as object).slice(0, 50) } : {}),
      ...(summary["body"] && typeof summary["body"] === "object" ? { bodyKeys: Object.keys(summary["body"] as object).slice(0, 50) } : {}),
    };
  }
  return summary;
}

/** Where rows go. A seam so tests can make writes fail. */
export const auditSink = {
  write: async (row: InsertAdminAuditLogRow): Promise<void> => {
    await db.insert(adminAuditLog).values(row);
  },
};

const pending = new Set<Promise<void>>();

/** Resolves once every audit write started so far has settled (tests, graceful shutdown). */
export async function flushAuditWrites(): Promise<void> {
  await Promise.allSettled([...pending]);
}

function record(row: InsertAdminAuditLogRow): void {
  const write = Promise.resolve()
    .then(() => auditSink.write(row))
    .catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), method: row.method, path: row.path, status: row.statusCode },
        "[audit] could not write an admin audit row",
      );
    })
    .finally(() => {
      pending.delete(write);
    });
  pending.add(write);
}

const isExport = (path: string, res: Response): boolean =>
  /\/exports?(\/|$)/i.test(path) || /attachment/i.test(String(res.getHeader("content-disposition") ?? ""));

/**
 * Keeps the most specific non-empty route params seen while routing. Express
 * puts them back to the outer router's (empty) params when a handler passes
 * an error on, so reading req.params at the end would lose them on failures.
 */
function captureParams(req: Request): () => Record<string, string> | null {
  let current = req.params;
  let captured: Record<string, string> | null = null;
  Object.defineProperty(req, "params", {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (value: Record<string, string>) => {
      current = value;
      if (value && typeof value === "object" && Object.keys(value).length > 0) captured = { ...value };
    },
  });
  return () => captured;
}

const ACTOR_KNOWN = "auditActorKnown";

/**
 * Called by authenticate() right after it sets req.user. If the caller has
 * already hung up, the audit row is written now (status 499) instead of
 * waiting for a response that will never finish.
 */
export function auditActorKnown(res: Response): void {
  const callback: unknown = res.locals?.[ACTOR_KNOWN];
  if (typeof callback === "function") (callback as () => void)();
}

// One "close" listener per connection, fanning out to the requests still
// waiting on it, so a keep-alive or pipelined connection never collects a
// listener per request.
const connectionWatchers = new WeakMap<object, Set<() => void>>();

/**
 * Calls `onClose` when the request's connection closes, or straight away if
 * it already has. Returns a function that stops watching. The connection
 * itself, not the response: with HTTP pipelining Node attaches only the first
 * response to the socket, and the ones queued behind it never emit "close"
 * (on-finished never fires for them either) when the caller hangs up.
 */
function watchConnection(req: Request, onClose: () => void): () => void {
  const socket = req.socket as (Request["socket"] & { destroyed?: boolean }) | undefined;
  if (!socket || typeof socket.once !== "function") return () => {};
  if (socket.destroyed) {
    onClose();
    return () => {};
  }
  let watchers = connectionWatchers.get(socket);
  if (!watchers) {
    const fresh = new Set<() => void>();
    watchers = fresh;
    connectionWatchers.set(socket, fresh);
    socket.once("close", () => {
      connectionWatchers.delete(socket);
      for (const watcher of [...fresh]) watcher();
    });
  }
  const set = watchers;
  set.add(onClose);
  return () => {
    set.delete(onClose);
  };
}

export function auditAdminActions(req: Request, res: Response, next: NextFunction): void {
  const mutating = MUTATING.has(req.method);
  // A GET can only be audited when it comes with an operator key.
  if (!mutating && readBearer(req) === null) {
    next();
    return;
  }

  let params: () => Record<string, string> | null = () => null;
  try {
    params = captureParams(req);
  } catch {
    // Never let the audit log stand in the way of a request.
  }

  // Decided once, as soon as both the outcome (finished or hung up) and the
  // actor are known, in whichever order they arrive. Until req.user is set
  // nothing is decided, so a hang-up while authenticate() is still looking
  // the caller up cannot lose the row.
  let decided = false;
  let outcome: number | null = null;
  const decide = () => {
    if (decided || outcome === null) return;
    const user = req.user;
    if (!user) return;
    decided = true;
    try {
      const viaKey = user.via === "operator_key";
      const path = (requestPathname(req) ?? (req.originalUrl || req.url || "").split("?")[0]!).slice(0, 2048);
      if (mutating) {
        if (!viaKey && user.role !== "admin") return;
      } else if (!(viaKey && isExport(path, res))) {
        return;
      }
      record({
        actorUserId: user.userId,
        actorKind: viaKey ? "operator_key" : "session",
        keyLabel: viaKey ? (user.keyLabel ?? null) : null,
        method: req.method,
        path,
        statusCode: outcome,
        targetIds: params(),
        requestSummary: summariseRequest(req.query, req.body, path),
        ip: req.ip ?? null,
      });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[audit] could not build an admin audit row");
    }
  };

  // The caller hung up first: the action may still happen, so record it (499).
  const hungUp = () => {
    if (outcome === null) outcome = res.writableFinished ? res.statusCode : CLIENT_CLOSED;
    decide();
  };

  res.locals[ACTOR_KNOWN] = decide;
  let unwatch = () => {};
  try {
    unwatch = watchConnection(req, hungUp);
  } catch {
    // Never let the audit log stand in the way of a request.
  }
  res.once("finish", () => {
    unwatch();
    if (outcome === null) outcome = res.statusCode;
    decide();
  });
  res.once("close", hungUp);
  next();
}
