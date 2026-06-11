import nodemailer, { type Transporter } from "nodemailer";
import handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

// import.meta.url cannot be used here: esbuild bundles everything into a single
// dist/index.mjs, so import.meta.url always resolves to the bundle file rather
// than the original source file location. process.cwd() is reliable because the
// server's start script always runs from the server/ directory.
/** Directory where all .hbs email templates live. */
const TEMPLATES_DIR = path.resolve(process.cwd(), "mail", "templates");

// Register the shared layout partial once at module load time.
// readFileSync is intentional here — this runs once at startup, not per-request.
const layoutSource = readFileSync(
  path.join(TEMPLATES_DIR, "partials", "layout.hbs"),
  "utf-8",
);
handlebars.registerPartial("layout", layoutSource);

/**
 * Parameters for sending a templated email.
 */
export interface SendMailOptions {
  /** Recipient email address. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** Template name (filename without .hbs extension) inside server/mail/templates/. */
  template: string;
  /** Data passed to the Handlebars template during rendering. */
  context: Record<string, unknown>;
  /** Optional file attachments (Nodemailer attachment format). */
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

/**
 * Builds the Nodemailer transporter appropriate for the current environment.
 *
 * In development: SMTP transport pointed at Mailpit (localhost:1025 by default).
 * In production: AWS SESv2 transport via @aws-sdk/client-sesv2.
 */
async function buildTransporter(): Promise<Transporter> {
  if (process.env["NODE_ENV"] !== "production") {
    // Development: use Mailpit (or any local SMTP sink).
    const host = process.env["SMTP_HOST"] ?? "localhost";
    const port = Number(process.env["SMTP_PORT"] ?? 1025);
    const user = process.env["SMTP_USER"];
    const pass = process.env["SMTP_PASS"];

    return nodemailer.createTransport({
      host,
      port,
      secure: false, // Mailpit does not use TLS
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  // Production: send via Amazon SES v2.
  // Lazily import so the SES SDK is not bundled in dev builds.
  const { SESv2Client, SendEmailCommand } = await import(
    "@aws-sdk/client-sesv2"
  );

  const region = process.env["AWS_REGION"];
  if (!region) {
    throw new Error(
      "AWS_REGION environment variable is required in production.",
    );
  }

  const sesClient = new SESv2Client({ region });

  return nodemailer.createTransport({
    SES: { sesClient, SendEmailCommand },
  });
}

/**
 * Promise-based transporter singleton.
 * Storing a Promise (rather than the resolved value) eliminates the
 * double-null-check race: concurrent callers all await the same promise
 * and never enter `buildTransporter` twice.
 */
let _transporterPromise: Promise<Transporter> | null = null;

/**
 * Returns the shared Nodemailer transporter, creating it on the first call.
 * Subsequent concurrent calls receive the same in-flight promise, so
 * `buildTransporter` is guaranteed to run at most once.
 */
function getTransporter(): Promise<Transporter> {
  if (!_transporterPromise) _transporterPromise = buildTransporter();
  return _transporterPromise;
}

/**
 * Loads a Handlebars template from disk, compiles it, and returns the
 * rendered HTML string.
 *
 * @param templateName - The template filename without the .hbs extension.
 *                       Must contain only alphanumeric characters, hyphens,
 *                       or underscores to prevent path-traversal attacks.
 * @param context - Data to interpolate into the template.
 * @throws If the template name is invalid or the template file cannot be read.
 */
async function renderTemplate(
  templateName: string,
  context: Record<string, unknown>,
): Promise<string> {
  // Guard against path-traversal: only allow safe filename characters.
  if (!/^[a-zA-Z0-9_-]+$/.test(templateName)) {
    throw new Error(`Invalid template name: "${templateName}"`);
  }

  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);

  let source: string;
  try {
    source = await readFile(templatePath, "utf-8");
  } catch {
    throw new Error(
      `Email template "${templateName}" not found at ${templatePath}. ` +
        `Ensure server/mail/templates/${templateName}.hbs exists.`,
    );
  }

  const compiled = handlebars.compile(source);
  const siteUrl = process.env["FRONTEND_URL"] ?? "http://localhost:3000";
  return compiled({ siteUrl, ...context });
}

/**
 * Sends a templated email.
 *
 * Loads the Handlebars template identified by `options.template`, renders it
 * with `options.context`, and dispatches the message via the environment-
 * appropriate transport (Mailpit in dev, Amazon SESv2 in prod).
 *
 * @param options - Recipient, subject, template name, and template context.
 * @throws If FROM_EMAIL is not set, the template is missing, or the send fails.
 */
export async function sendMail(options: SendMailOptions): Promise<void> {
  const { to, subject, template, context } = options;

  const fromEmail = process.env["FROM_EMAIL"];
  if (!fromEmail) {
    throw new Error(
      "FROM_EMAIL environment variable is required to send email.",
    );
  }

  const html = await renderTemplate(template, context);
  const transporter = await getTransporter();

  await transporter.sendMail({
    from: fromEmail,
    to,
    subject,
    html,
    // Plain-text fallback: strip HTML tags for clients that prefer text/plain.
    text: html.replace(/<[^>]+>/g, ""),
    ...(options.attachments?.length ? { attachments: options.attachments } : {}),
  });
}
