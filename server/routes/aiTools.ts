import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { generatePdf } from '../controllers/aiTools.controller';

const router = Router();

/**
 * POST /api/ai-tools/generate-pdf
 * Authenticated. Generates a business document PDF and emails it to the user.
 */
router.post('/generate-pdf', authenticate, generatePdf);

export default router;
