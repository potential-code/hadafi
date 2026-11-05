import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { Request, Response } from "express";
import { z } from "zod";

/**
 * AI mentors run on Potential's bot service. The browser used to call it
 * directly and unauthenticated; these handlers put it behind the learner's
 * Hadafi session, so a learner's conversation only leaves through the Hadafi
 * server, and only to the mentors Hadafi offers.
 */

/** Read per request so the upstream can be pointed elsewhere (tests, staging). */
function upstream(): string {
  return (process.env["AI_MENTOR_API_URL"] || "https://api.potential.com").replace(/\/+$/, "");
}

/** Hadafi's six AI mentors (client/lib/constants/content.ts AI_MENTORS). No other bot can be reached. */
export const AI_MENTOR_BOT_IDS = new Set([
  "64b78f8ea3495eade7931f1f", // Corporate Security & Safety Coach
  "64b7b59c2d7b52ec97f3a258", // Enterprise Sales Coach
  "64b7a7682d7b52ec97f3a21d", // Marketing Coach
  "6540b46f64bed7823ecd4209", // Legal Consultant
  "64cb87a1293c2813e908395e", // Sustainability Bot
  "64b79d632d7b52ec97f3a204", // Leadership Mentor
]);

const unavailable = {
  success: false,
  error: { message: "This mentor is unavailable right now. Please try again in a moment.", code: "MENTOR_UNAVAILABLE" },
};

function knownBot(req: Request, res: Response): string | null {
  const botId = String(req.params["botId"] ?? "");
  if (AI_MENTOR_BOT_IDS.has(botId)) return botId;
  res.status(404).json({ success: false, error: { message: "This mentor could not be found.", code: "NOT_FOUND" } });
  return null;
}

export const aiMentorChatDto = z.object({
  message: z.string().trim().min(1).max(4000),
  sessionId: z.string().regex(/^[\w-]{1,100}$/),
  /** A text document the learner shared (read in the browser). */
  document: z
    .object({
      name: z.string().trim().min(1).max(120),
      text: z.string().min(1).max(20_000),
      /** The browser already cut a long document short. */
      truncated: z.boolean().optional(),
    })
    .optional(),
});

/** How much of a shared document the mentor reads. */
const DOCUMENT_CHARS = 12_000;

/** The learner's words, then the document, the way the hosted Potential chat attaches one. */
export function withDocument(message: string, doc?: { name: string; text: string; truncated?: boolean }): string {
  if (!doc) return message;
  const text = doc.text.trim();
  const cut = doc.truncated === true || text.length > DOCUMENT_CHARS;
  const name = doc.name.replace(/["\r\n]/g, "'");
  return `${message}\n\n[Attached document "${name}"${cut ? " (only the first part of a long document)" : ""}]\n${text.slice(0, DOCUMENT_CHARS)}`;
}

/**
 * GET /api/ai-mentors/:botId
 * The mentor's name, greeting and ice-breakers. Never the bot's system prompt.
 */
export async function getAiMentor(req: Request, res: Response): Promise<void> {
  const botId = knownBot(req, res);
  if (!botId) return;
  try {
    const up = await fetch(`${upstream()}/api/admin/bot/${botId}`, { signal: AbortSignal.timeout(10_000) });
    if (!up.ok) {
      res.status(502).json(unavailable);
      return;
    }
    const bot = (await up.json()) as { name?: unknown; greeting?: unknown; active?: unknown; prePrompt?: unknown };
    res.json({
      success: true,
      data: {
        name: typeof bot.name === "string" ? bot.name : "",
        greeting: typeof bot.greeting === "string" ? bot.greeting : "",
        active: bot.active !== false,
        prePrompt: Array.isArray(bot.prePrompt)
          ? bot.prePrompt.filter((p): p is string => typeof p === "string").slice(0, 6)
          : [],
      },
    });
  } catch {
    res.status(502).json(unavailable);
  }
}

/**
 * POST /api/ai-mentors/:botId/chat  { message, sessionId, document? }
 * Streams the bot's server-sent events back to the learner.
 */
export async function chatWithAiMentor(req: Request, res: Response): Promise<void> {
  const botId = knownBot(req, res);
  if (!botId) return;
  const { message, sessionId, document } = req.body as z.infer<typeof aiMentorChatDto>;
  const abort = new AbortController();
  res.on("close", () => abort.abort());
  try {
    const up = await fetch(`${upstream()}/agent/chatbot/${botId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Scoped to the learner, so one learner's session id can never continue another's conversation.
      body: JSON.stringify({ message: withDocument(message, document), sessionId: `hadafi-${req.user!.userId}-${sessionId}` }),
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]),
    });
    if (!up.ok || !up.body) {
      res.status(502).json(unavailable);
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", up.headers.get("content-type") ?? "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    Readable.fromWeb(up.body as unknown as WebReadableStream<Uint8Array>)
      .on("error", () => res.end())
      .pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).json(unavailable);
    else res.end();
  }
}
