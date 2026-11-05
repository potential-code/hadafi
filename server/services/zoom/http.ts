import { ZoomError } from "./errors";

/**
 * Zoom over Server-to-Server OAuth: the account token (cached until shortly
 * before it expires), timeouts, and retries for the failures that clear on
 * their own (rate limits, dropped connections, Zoom's 5xx).
 */

const API_BASE = (process.env["ZOOM_API_BASE"] ?? "https://api.zoom.us/v2").replace(/\/$/, "");
const OAUTH_URL = process.env["ZOOM_OAUTH_URL"] ?? "https://zoom.us/oauth/token";
const TIMEOUT_MS = Number(process.env["ZOOM_TIMEOUT_MS"] ?? 15_000);
const ATTEMPTS = 3;

export function zoomCredentials(): { accountId: string; clientId: string; clientSecret: string } | null {
  const accountId = process.env["ZOOM_ACCOUNT_ID"];
  const clientId = process.env["ZOOM_CLIENT_ID"];
  const clientSecret = process.env["ZOOM_CLIENT_SECRET"];
  return accountId && clientId && clientSecret ? { accountId, clientId, clientSecret } : null;
}

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(force = false): Promise<string> {
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const creds = zoomCredentials();
  if (!creds) throw new ZoomError("not_configured", "Zoom credentials are not set.");
  let res: Response;
  try {
    res = await fetch(`${OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw ZoomError.fromTransport(err);
  }
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !body?.access_token) throw ZoomError.fromResponse(res.status, body);
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function zoomRequest<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | number | undefined>; timeoutMs?: number } = {},
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

  let refreshed = false;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { Authorization: `Bearer ${await accessToken()}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof ZoomError) throw err;
      const e = ZoomError.fromTransport(err);
      if (attempt < ATTEMPTS) {
        await sleep(400 * attempt);
        continue;
      }
      throw e;
    }
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => null);
    if (res.ok) return body as T;

    // A token revoked early: get a fresh one once.
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await accessToken(true);
      continue;
    }
    const err = ZoomError.fromResponse(res.status, body, res.headers.get("retry-after"));
    if (err.retryable && attempt < ATTEMPTS) {
      await sleep(Math.min(err.retryAfterMs ?? 500 * attempt, 5000));
      continue;
    }
    throw err;
  }
}
