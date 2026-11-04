import { Router, type IRouter } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { perUser, MINUTE, DAY } from "../middleware/limits";
import { aiMentorChatDto, chatWithAiMentor, getAiMentor } from "../controllers/aiMentor.controller";

/**
 * AI mentor chat, proxied to Potential's bot service behind the learner's
 * session (see controllers/aiMentor.controller.ts). AI_MENTOR_API_URL
 * overrides the upstream (default https://api.potential.com).
 */
const router: IRouter = Router();

const testing = process.env["NODE_ENV"] === "test";

// Per learner, so one busy office network doesn't share a limit.
const chatPerMinute = perUser(
  "ai-mentor-chat-minute",
  MINUTE,
  testing ? 10_000 : 20,
  "You're sending messages quickly. Wait a moment and try again.",
);
// And a daily ceiling: 20 a minute alone would allow ~28,000 AI calls a day.
const chatPerDay = perUser(
  "ai-mentor-chat-day",
  DAY,
  testing ? 10_000 : 200,
  "You've reached today's limit for mentor chat. Please try again tomorrow.",
);

/** GET /api/ai-mentors/:botId — name, greeting, ice-breakers. */
router.get("/:botId", authenticate, getAiMentor);

/** POST /api/ai-mentors/:botId/chat — streams the mentor's reply (SSE). */
router.post("/:botId/chat", authenticate, chatPerMinute, chatPerDay, validate(aiMentorChatDto), chatWithAiMentor);

export default router;
