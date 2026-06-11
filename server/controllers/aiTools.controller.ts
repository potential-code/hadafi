import type { Request, Response } from 'express';
import { generateBusinessDocumentPdf } from '../services/aiTools.service';
import { sendMail } from '../mail/mailer';

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
 * emails it to the specified address as an attachment.
 *
 * Request body:
 *   - documentType  {string}  One of the ALLOWED_TYPES slugs.
 *   - title         {string?} Optional document title; falls back to the type label.
 *   - content       {string}  Plain-text body to render into the PDF.
 *   - emailAddress  {string}  Recipient address for the email with the PDF attachment.
 *
 * Responds with `{ success: true, emailSent: true, email }` on success.
 */
export async function generatePdf(req: Request, res: Response): Promise<void> {
  const { documentType, title, content, emailAddress } = req.body as {
    documentType?: string;
    title?: string;
    content?: string;
    emailAddress?: string;
  };

  if (!documentType || !ALLOWED_TYPES.has(documentType)) {
    res.status(400).json({ error: 'Invalid or missing documentType' });
    return;
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
    res.status(400).json({ error: 'Valid emailAddress is required' });
    return;
  }

  const docTitle =
    typeof title === 'string' && title.trim()
      ? title.trim()
      : (TYPE_LABELS[documentType] ?? documentType);
  const label = TYPE_LABELS[documentType] ?? 'Business Document';

  try {
    const pdfBuffer = await generateBusinessDocumentPdf(documentType, docTitle, content);

    await sendMail({
      to: emailAddress,
      subject: `Your ${label} — SMEEP AI Business Assistant`,
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
