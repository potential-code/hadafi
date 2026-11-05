import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { perUser, DAY, MINUTE } from "../middleware/limits";
import { DOCUMENT_MAX_BYTES, DocumentReadError, readDocumentText } from "../services/documentText.service";

/**
 * Ask Hana (ported from SMEEP): documents a learner shares in a Hana chat (Ask
 * Hana, AI mentors). The file is read in memory and dropped; only its text
 * comes back, and the browser sends that with the learner's next message.
 * Nothing is written to disk or the database.
 */
const router: IRouter = Router();

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1, fields: 0, parts: 2 },
});

const testing = process.env["NODE_ENV"] === "test";
const LIMITED = "You've shared a lot of files. Wait a few minutes and try again.";
// Tests check the 10-minute cap on their own fixture user, so it stays real in tests.
const documentsPer10Min = perUser("ask-hana-docs-10m", 10 * MINUTE, 20, LIMITED);
const documentsPerDay = perUser("ask-hana-docs-day", DAY, testing ? 10_000 : 100, LIMITED);

/** One document read at a time per person: reading a PDF is the expensive part. */
const reading = new Set<string>();

function fail(res: Response, status: number, message: string, code: string): void {
  res.status(status).json({ success: false, error: { message, code } });
}

/** multer reports the browser's UTF-8 filename as latin1; keep just a safe name. */
export function cleanName(original: string): string {
  const utf8 = Buffer.from(original, "latin1").toString("utf8");
  const base = utf8.split(/[\\/]/).pop() ?? "document";
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return base.replace(/[\u0000-\u001f\u007f"<>]/g, "").trim().slice(0, 120) || "document";
}

/**
 * POST /api/ask-hana/documents   multipart, field "file"
 * PDF, Word (.docx), TXT, Markdown or CSV up to 15 MB → { name, kind, size, pages?, text, truncated }
 */
router.post(
  "/documents",
  authenticate,
  requireRole("sme", "mentor", "admin"),
  documentsPer10Min,
  documentsPerDay,
  (req: Request, res: Response, next: NextFunction) => {
    const who = req.user!.userId;
    if (reading.has(who)) {
      fail(res, 429, "Hana is still reading your last file. Try again in a moment.", "RATE_LIMITED");
      return;
    }
    reading.add(who);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      reading.delete(who);
    };
    res.on("finish", release);
    res.on("close", release);
    documentUpload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        fail(res, 413, "That file is over 15 MB. Try a smaller one.", "FILE_TOO_LARGE");
        return;
      }
      if (err) {
        fail(res, 400, "Share one file at a time, in the \"file\" field.", "UPLOAD_FAILED");
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      fail(res, 400, "Choose a file to share with Hana.", "NO_FILE");
      return;
    }
    try {
      const doc = await readDocumentText(req.file.buffer, cleanName(req.file.originalname));
      res.set("Cache-Control", "no-store");
      res.json({ success: true, data: doc });
    } catch (e) {
      if (e instanceof DocumentReadError) {
        fail(res, e.code === "UNSUPPORTED_TYPE" ? 415 : 422, e.message, e.code);
        return;
      }
      fail(res, 422, "That file couldn't be read. Try again, or share a different file.", "UNREADABLE");
    }
  },
);

export default router;
