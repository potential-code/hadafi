import type { Request, Response } from 'express';
import { generateBusinessDocumentPdf } from '../services/aiTools.service';
import { eq } from 'drizzle-orm';
import { sendMail } from '../mail/mailer';
import { db } from '../db';
import { users } from '../db/schema';

/** Accepted documentType slugs — validated before processing. */
const ALLOWED_TYPES = new Set([
  'business-ideas',
  'business-plan',
  'marketing-plan',
  'product-proposal',
]);

/** Human-readable labels for each document type slug. */
const TYPE_LABELS: Record<string, string> = {
  'business-ideas': 'Business Ideas',
  'business-plan': 'Business Plan',
  'marketing-plan': 'Marketing Plan',
  'product-proposal': 'Product / Sales Proposal',
};

/**
 * POST /api/ai-tools/generate-pdf
 *
 * Generates a branded PDF from AI-produced business document content and
 * emails it to the signed-in learner's own address. The address always comes
 * from the account, never the request, so the tool can't be used to send mail
 * to anyone else.
 *
 * Request body:
 *   - documentType  {string}  One of the ALLOWED_TYPES slugs.
 *   - title         {string?} Optional document title; falls back to the type label.
 *   - content       {string}  Plain-text body to render into the PDF.
 *
 * Responds with `{ success: true, emailSent: true, email }` on success.
 */
export async function generatePdf(req: Request, res: Response): Promise<void> {
  const { documentType, title, content } = req.body as {
    documentType?: string;
    title?: string;
    content?: string;
  };

  if (!documentType || !ALLOWED_TYPES.has(documentType)) {
    res.status(400).json({ error: 'Invalid or missing documentType' });
    return;
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  // A business plan is a few thousand words at most.
  if (content.length > 60_000 || (typeof title === 'string' && title.length > 200)) {
    res.status(400).json({ error: 'This document is too long to email' });
    return;
  }
  const [account] = req.user
    ? await db.select({ email: users.email }).from(users).where(eq(users.id, req.user.userId)).limit(1)
    : [];
  if (!account?.email) {
    res.status(401).json({ error: 'Please sign in again to email this document' });
    return;
  }
  const emailAddress = account.email;

  const docTitle =
    typeof title === 'string' && title.trim()
      ? title.trim()
      : (TYPE_LABELS[documentType] ?? documentType);
  const label = TYPE_LABELS[documentType] ?? 'Business Document';

  try {
    const pdfBuffer = await generateBusinessDocumentPdf(documentType, docTitle, content);

    await sendMail({
      to: emailAddress,
      subject: `Your ${label} — Hadafi AI Business Assistant`,
      template: 'business-document',
      context: { documentTypeName: label, title: docTitle },
      attachments: [
        {
          filename: `${documentType}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    res.json({ success: true, emailSent: true, email: emailAddress });
  } catch (err) {
    console.error('[aiTools] generatePdf error', err);
    res.status(500).json({ error: 'Failed to generate or send document' });
  }
}
