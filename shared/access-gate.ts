const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "Potential";

const STATIC_ASSET_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".bmp",
  ".tiff",
  ".css",
  ".js",
  ".mjs",
  ".map",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".txt",
  ".xml",
  ".json",
  ".webmanifest",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".pdf",
];

const EXEMPT_PATH_PREFIXES = ["/api/", "/_next/"];
const EXEMPT_EXACT_PATHS = new Set([
  "/api",
  "/health",
  "/healthz",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

export interface ExpectedCredentials {
  username: string;
  password: string;
}

export function getExpectedCredentials(
  env: Record<string, string | undefined> = (
    typeof process !== "undefined" ? process.env : {}
  ) as Record<string, string | undefined>,
): ExpectedCredentials {
  const username = env["ACCESS_USERNAME"]?.trim() || DEFAULT_USERNAME;
  const password = env["ACCESS_PASSWORD"] || DEFAULT_PASSWORD;
  return { username, password };
}

export function isPathExempt(pathname: string): boolean {
  if (!pathname) return false;
  if (EXEMPT_EXACT_PATHS.has(pathname)) return true;
  for (const prefix of EXEMPT_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  const lower = pathname.toLowerCase();
  for (const ext of STATIC_ASSET_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function decodeBase64(value: string): string | null {
  try {
    if (typeof atob === "function") {
      const binary = atob(value);
      // Decode binary string as UTF-8.
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      if (typeof TextDecoder !== "undefined") {
        return new TextDecoder("utf-8").decode(bytes);
      }
      return binary;
    }
  } catch {
    return null;
  }
  return null;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still iterate to avoid trivial timing leak on length, then return false.
    let diff = 1;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function verifyBasicAuthHeader(
  header: string | null | undefined,
  expected: ExpectedCredentials = getExpectedCredentials(),
): boolean {
  if (!header) return false;
  const [scheme, encoded] = header.split(" ");
  if (!scheme || !encoded) return false;
  if (scheme.toLowerCase() !== "basic") return false;
  const decoded = decodeBase64(encoded.trim());
  if (decoded == null) return false;
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  const userOk = constantTimeEquals(user, expected.username);
  const passOk = constantTimeEquals(pass, expected.password);
  return userOk && passOk;
}

export const UNAUTHORIZED_HEADERS: Record<string, string> = {
  "WWW-Authenticate": 'Basic realm="SMEEP", charset="UTF-8"',
  "Cache-Control": "no-store",
};

export function unauthorizedResponseInit(): {
  status: number;
  headers: Record<string, string>;
} {
  return {
    status: 401,
    headers: { ...UNAUTHORIZED_HEADERS },
  };
}
