import path from "path";
import { fileURLToPath } from 'url'
import express, { type Express } from "express";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./config/logger";
import { basicAuthGate } from "./middleware/basic-auth";
import { errorHandler } from "./middleware/error-handler";

// Fail fast if JWT_SECRET is missing — auth cannot function without it.
if (!process.env["JWT_SECRET"]) {
  throw new Error(
    "JWT_SECRET environment variable is required but was not provided.",
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
  origin: process.env["FRONTEND_URL"] ?? "http://localhost:3000",
  credentials: true,
}));
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

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
