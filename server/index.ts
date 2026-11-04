import path from "path";
import { fileURLToPath } from 'url'
import express, { type Express } from "express";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { toNodeHandler } from "better-auth/node";
import router from "./routes";
import { auth } from "./auth";
import { logger } from "./config/logger";
import { basicAuthGate } from "./middleware/basic-auth";
import { errorHandler } from "./middleware/error-handler";
import { refreshOutdatedCertificates } from "./services/lms/certificate.service";

// Fail fast without a session-signing secret. BETTER_AUTH_SECRET is preferred;
// JWT_SECRET (the pre-Better-Auth secret) is accepted so deploys keep working.
if (!process.env["BETTER_AUTH_SECRET"] && !process.env["JWT_SECRET"]) {
  throw new Error(
    "BETTER_AUTH_SECRET (or JWT_SECRET) environment variable is required but was not provided.",
  );
}

// The AI assistant mints service JWTs signed with COPILOT_SERVICE_JWT_SECRET
// (must match potential-ai's SERVICE_JWT_SECRET). Validate presence and
// strength at boot rather than failing per-request: an 8-char HMAC key is
// brute-forceable. Optional — if unset, the assistant endpoints 503 cleanly.
const copilotSecret = process.env["COPILOT_SERVICE_JWT_SECRET"];
if (copilotSecret && copilotSecret.length < 32) {
  throw new Error(
    "COPILOT_SERVICE_JWT_SECRET must be at least 32 characters when set.",
  );
}

const app: Express = express();

// Hadafi runs behind Dokploy's proxy (Traefik), which adds the visitor's
// address to X-Forwarded-For. Trust only private-network hops, so the rate
// limits see each visitor's real address (without this every visitor shares
// the proxy's address, and one budget) and a visitor can't fake theirs.
// TRUST_PROXY_HOPS overrides this with a fixed hop count, e.g. behind a CDN.
app.set(
  "trust proxy",
  process.env["TRUST_PROXY_HOPS"] ? Number(process.env["TRUST_PROXY_HOPS"]) : "loopback, linklocal, uniquelocal",
);

// Security headers (HSTS, nosniff, frame-options, etc.). Registered first so
// every response — including errors — carries them.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  // Lock CORS to the configured frontend origin. Falls back to localhost in
  // development; override via FRONTEND_URL in production.
  // `||`, not `??`: compose passes an unset FRONTEND_URL as "", which would allow any origin.
  origin: process.env["FRONTEND_URL"] || "http://localhost:3000",
  credentials: true,
}));
// Better Auth reads the raw request body, so it is mounted before the body
// parsers. It owns everything under /api/auth (sign-in, sign-up, sessions).
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files without authentication — files are addressed by
// opaque filenames and do not expose sensitive data beyond the file itself.
// The basicAuthGate (admin UI guard) is intentionally bypassed here.
app.use("/uploads", express.static(path.join(__dirname, '..', 'uploads')));

app.use(basicAuthGate);

app.use("/api", router);

// Global error handler — must be registered after all routes.
app.use(errorHandler);

// HADAFI_SKIP_LISTEN=1 makes this module side-effect-free on import, so the
// tests can start the app on a port of their own (server/tests/helpers.ts).
if (process.env["HADAFI_SKIP_LISTEN"] !== "1") {
  const rawPort = process.env["PORT"];
  if (!rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }
  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
  // Longer than the proxy's idle timeout, so the proxy never reuses a
  // connection Node is closing (that showed up as "socket hang up").
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // Certificates drawn by an older renderer (or never drawn) are drawn again,
  // in the background; it never blocks the boot.
  void refreshOutdatedCertificates();
}

export { app };
