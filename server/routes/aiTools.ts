import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { generatePdf } from '../controllers/aiTools.controller';
import { perUser, HOUR, DAY } from '../middleware/limits';

const router = Router();

/**
 * POST /api/ai-tools/generate-pdf
 * Authenticated. Generates a business document PDF and emails it to the user.
 */
// Each call sends an email from Hadafi's sender, so it is capped per learner:
// enough for real use, too few to use Hadafi as a mail relay.
const pdfPerHour = perUser('pdf-email-hour', HOUR, 5, 'You can email up to 5 documents an hour. Please try again later.');
const pdfPerDay = perUser('pdf-email-day', DAY, 20, 'You can email up to 20 documents a day. Please try again tomorrow.');
router.post('/generate-pdf', authenticate, pdfPerHour, pdfPerDay, generatePdf);

export default router;
