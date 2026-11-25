import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { ASK_HANA_PROMPT, SIGN_UP_PROMPT } from "../../shared/hana/prompts";

// Claims for the service tokens Hadafi mints for potential-ai (see
// potential-ai's src/lib/tokenScope.ts). `scope` says what a token is for,
// and browser tokens list the fingerprints of the system prompts they may
// send: potential-ai ignores any other `__system_prompt__`, so a browser can't
// turn Hana into a general-purpose model billed to Hadafi. potential-ai only
// enforces these once `hadafi` is in its STRICT_TOKEN_PLATFORMS; until then
// they are ignored.
//
// The scope always comes from the verified session role (req.user.role, read
// from the users row by `authenticate`), never from the request.

export type TokenScope = "guest" | "user" | "admin" | "server";

/** SHA-256 of the exact prompt text, base64url (what potential-ai compares). */
export const fingerprint = (prompt: string) =>
  crypto.createHash("sha256").update(prompt, "utf8").digest("base64url");

const SIGN_UP = [fingerprint(SIGN_UP_PROMPT)];
// Signed-in users may still be on the landing page, so they get the sign-up prompt too.
const SIGNED_IN = [ASK_HANA_PROMPT, SIGN_UP_PROMPT].map(fingerprint);

/** The scope for a signed-in browser: admins get the data agents, everyone else is a user. */
export const browserScope = (role: string | undefined): "user" | "admin" =>
  role === "admin" ? "admin" : "user";

/** A signed-in browser: chat and voice agents; admins also get the data agents. */
export const browserClaims = (role: string | undefined) => ({
  scope: browserScope(role),
  prompts: SIGNED_IN,
});

/** The public sign-up chat: the default agent and the sign-up prompt only. */
export const guestClaims = () => ({ scope: "guest" as const, prompts: SIGN_UP });

/** Hadafi's own server calling potential-ai's /api/* endpoints (none yet). */
export const SERVER_CLAIMS = { scope: "server" as const };

/** Who mints these tokens and who they are for (the `iss` and `aud` claims). */
export const SERVICE_TOKEN_ISSUER = "hadafi";
export const SERVICE_TOKEN_AUDIENCE = "potential-ai";

/**
 * Signs a service token for potential-ai: HS256 with COPILOT_SERVICE_JWT_SECRET
 * (potential-ai's SERVICE_JWT_SECRET), iss "hadafi", aud "potential-ai", so a
 * token can be told apart from tokens other platforms sign with a shared
 * secret, and refused anywhere it wasn't meant for once potential-ai checks
 * them (it ignores both claims today).
 */
export function signServiceToken(payload: Record<string, unknown>, secret: string, expiresInSeconds: number): string {
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    issuer: SERVICE_TOKEN_ISSUER,
    audience: SERVICE_TOKEN_AUDIENCE,
    expiresIn: expiresInSeconds,
  });
}
