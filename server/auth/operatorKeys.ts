import crypto from "node:crypto";
import type { Request } from "express";
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { users } from "../db/schema";
import { logger } from "../config/logger";

// Operator keys: how an automated operator (Maya, the AI operator) calls the
// admin API without a browser session. See docs/operator-access.md.
//
//   OPERATOR_API_KEYS            label:sha256hex entries, comma/space separated
//   OPERATOR_SERVICE_USER_EMAIL  the admin account every valid key acts as
//
// Only SHA-256 hashes of keys live on the server; the raw key is shown once
// when it is generated (scripts/generate-operator-key.mjs) and never stored.
// With OPERATOR_API_KEYS unset, Bearer headers are ignored altogether.

export interface OperatorKey {
  label: string;
  hash: Buffer;
}

const ENTRY = /^([A-Za-z0-9][A-Za-z0-9._-]{0,63}):([0-9a-fA-F]{64})$/;

let cache: { raw: string; keys: OperatorKey[] } | null = null;

/** Parses OPERATOR_API_KEYS. Malformed entries are skipped (and logged by label position only). */
export function parseOperatorKeys(raw: string | undefined): OperatorKey[] {
  if (!raw || !raw.trim()) return [];
  const keys: OperatorKey[] = [];
  const entries = raw.split(/[\s,]+/).filter(Boolean);
  entries.forEach((entry, i) => {
    const m = ENTRY.exec(entry);
    if (!m) {
      // Never log the entry itself: a raw key pasted by mistake would end up in the logs.
      logger.warn({ entry: i + 1 }, "[operator-keys] skipping a malformed OPERATOR_API_KEYS entry (expected label:sha256hex)");
      return;
    }
    keys.push({ label: m[1]!, hash: Buffer.from(m[2]!.toLowerCase(), "hex") });
  });
  return keys;
}

/** The configured keys, re-parsed only when the variable changes. */
export function configuredOperatorKeys(): OperatorKey[] {
  const raw = process.env["OPERATOR_API_KEYS"] ?? "";
  if (cache?.raw !== raw) cache = { raw, keys: parseOperatorKeys(raw) };
  return cache.keys;
}

export const operatorKeysEnabled = (): boolean => configuredOperatorKeys().length > 0;

export const hashOperatorKey = (rawKey: string): Buffer => crypto.createHash("sha256").update(rawKey, "utf8").digest();

/**
 * The label of the key `rawKey` hashes to, or null. Compares against every
 * configured hash in constant time, without stopping at the first match.
 */
export function matchOperatorKey(rawKey: string, keys: OperatorKey[] = configuredOperatorKeys()): string | null {
  if (!rawKey) return null;
  const given = hashOperatorKey(rawKey);
  let found: string | null = null;
  for (const key of keys) {
    if (crypto.timingSafeEqual(given, key.hash) && found === null) found = key.label;
  }
  return found;
}

/** The token of an `Authorization: Bearer <token>` header; null for no header or another scheme (e.g. Basic). */
export function readBearer(req: Request): string | null {
  const header = req.headers["authorization"];
  if (typeof header !== "string") return null;
  const m = /^Bearer(?:\s+(.*))?$/i.exec(header.trim());
  return m ? (m[1] ?? "").trim() : null;
}

/**
 * The request's path as routing sees it: the pathname of the request target,
 * whether it came as "/api/x?y" or in absolute form ("POST http://host/api/x",
 * which Express routes by its path), with dot segments resolved. Case is kept;
 * compare lowercased. Null when the target cannot be parsed.
 */
export function requestPathname(req: Request): string | null {
  try {
    return new URL(req.originalUrl || req.url || "/", "http://x").pathname;
  } catch {
    return null;
  }
}

// Request targets that the URL parser above and Express's router could read
// differently: dot segments, backslashes, encoded dots, slashes or
// backslashes, empty segments. Express matches the raw path, so for these the
// allowlist could approve one route while Express runs another. Operator keys
// are refused on them; nothing the operator MCP sends looks like this.
const AMBIGUOUS_TARGET = /\\|%2e|%2f|%5c|\/\.{1,2}(\/|$)|\/\//i;

/** The raw path of the request target, before any normalisation (scheme and host of an absolute-form target dropped). */
function rawTargetPath(req: Request): string {
  const target = (req.originalUrl || req.url || "").split(/[?#]/)[0]!;
  return target.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
}

// Routes where an operator key is never a sign-in: Better Auth's own
// (/api/auth, which never reaches this middleware anyway) and the account
// routes, where a key could set a password on the service account, edit its
// profile or mint tokens for it. Checked on the normalised path, so an
// absolute-form request line ("POST http://x/api/account/me") is caught too.
const KEYLESS_PREFIXES = ["/api/auth", "/api/account"];

/** False when a Bearer header on this request must not be treated as an operator key. */
export function operatorKeyAllowedFor(req: Request): boolean {
  const pathname = requestPathname(req)?.toLowerCase();
  if (!pathname) return false;
  return !KEYLESS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** True when the request target reads the same to the allowlist and to Express (see AMBIGUOUS_TARGET). */
export function isUnambiguousTarget(req: Request): boolean {
  return !AMBIGUOUS_TARGET.test(rawTargetPath(req));
}

export const operatorServiceEmail = (): string | null =>
  process.env["OPERATOR_SERVICE_USER_EMAIL"]?.trim().toLowerCase() || null;

/** True when `email` is the one in OPERATOR_SERVICE_USER_EMAIL. */
export function isOperatorServiceEmail(email: string | null | undefined): boolean {
  const service = operatorServiceEmail();
  return !!service && !!email && email.trim().toLowerCase() === service;
}

/**
 * The name scripts/create-operator-user.mjs gives the service account (kept
 * in step by a test). It marks the account on its own, so the account can't
 * sign in even when OPERATOR_SERVICE_USER_EMAIL is unset, e.g. after the
 * feature is turned off or on a deploy that forgot the variable.
 */
export const OPERATOR_SERVICE_NAME = "Maya (AI operator)";

/** True for the operator name, whatever its case or surrounding spaces. */
export function isOperatorServiceName(name: unknown): boolean {
  return typeof name === "string" && name.trim().toLowerCase() === OPERATOR_SERVICE_NAME.toLowerCase();
}

/**
 * True when this user is the operator service account, which must never
 * sign in or hold a browser session: the address in
 * OPERATOR_SERVICE_USER_EMAIL, or any account carrying the operator name.
 */
export function isOperatorServiceUser(user: { email?: string | null; name?: string | null }): boolean {
  return isOperatorServiceEmail(user.email) || isOperatorServiceName(user.name);
}

/** isOperatorServiceUser for a sign-in attempt, where only the address is known (one lookup). */
export async function isOperatorServiceAddress(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if (isOperatorServiceEmail(email)) return true;
  const [row] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.trim().toLowerCase()))
    .limit(1);
  return !!row && isOperatorServiceName(row.fullName);
}

export type OperatorAuthResult =
  | { ok: true; userId: string; role: string; keyLabel: string }
  | { ok: false; reason: "bad_key" | "no_service_user" | "service_user_not_admin" };

/**
 * Resolves a Bearer token to the service user. Looked up on every request,
 * so demoting or deleting the service user takes effect immediately.
 */
export async function authenticateOperatorKey(rawKey: string): Promise<OperatorAuthResult> {
  const keyLabel = matchOperatorKey(rawKey);
  if (!keyLabel) return { ok: false, reason: "bad_key" };
  const email = operatorServiceEmail();
  if (!email) return { ok: false, reason: "no_service_user" };
  const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { ok: false, reason: "no_service_user" };
  if (user.role !== "admin") return { ok: false, reason: "service_user_not_admin" };
  return { ok: true, userId: user.id, role: user.role, keyLabel };
}
