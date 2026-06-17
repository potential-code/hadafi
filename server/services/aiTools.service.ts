import PDFDocument from 'pdfkit';

/** Maps documentType slugs to their human-readable display labels. */
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  'business-ideas': 'Business Ideas',
  'business-plan': 'Business Plan',
  'marketing-plan': 'Marketing Plan',
  'product-proposal': 'Product / Sales Proposal',
};

const BRAND = '#e41674';   // hadafi primary brand color
const BODY  = '#1f2937';   // body text
const DIVIDER = '#f7e8f0'; // dividers / section backgrounds

type PDFKitDoc = InstanceType<typeof PDFDocument>;

interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/** Split a line into styled runs on **bold** / *italic* markdown markers. */
function tokenizeInline(text: string): Run[] {
  const runs: Run[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__|_([^_]+)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[1] != null) runs.push({ text: m[1], bold: true });
    else if (m[2] != null) runs.push({ text: m[2], italic: true });
    else if (m[3] != null) runs.push({ text: m[3], bold: true });
    else if (m[4] != null) runs.push({ text: m[4], italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.filter((r) => r.text.length > 0);
}

/** Render inline-styled text starting at the current cursor, wrapping to width. */
function renderRich(
  doc: PDFKitDoc,
  text: string,
  opts: { width: number; fontSize?: number; color?: string },
): void {
  const runs = tokenizeInline(text);
  if (runs.length === 0) return;
  doc.fontSize(opts.fontSize ?? 11).fillColor(opts.color ?? BODY);
  runs.forEach((run, i) => {
    const isLast = i === runs.length - 1;
    doc.font(run.bold ? 'Helvetica-Bold' : run.italic ? 'Helvetica-Oblique' : 'Helvetica');
    // Pass layout options only on the first fragment; continued runs inherit them.
    doc.text(run.text, i === 0 ? { width: opts.width, continued: !isLast } : { continued: !isLast });
  });
  doc.font('Helvetica');
}

/**
 * Render markdown content as formatted PDF blocks: ATX headings (#/##/###),
 * bullet lists (-, *), numbered lists, horizontal rules (---), and inline
 * **bold** / *italic*. Falls back to plain paragraphs for everything else.
 */
function renderMarkdownBody(doc: PDFKitDoc, content: string, left: number, contentWidth: number): void {
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  const divider = () => {
    doc.moveDown(0.4);
    doc.moveTo(left, doc.y).lineTo(left + contentWidth, doc.y).strokeColor(DIVIDER).lineWidth(1).stroke();
    doc.moveDown(0.6);
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();

    // Blank line → paragraph spacing.
    if (trimmed === '') {
      doc.moveDown(0.5);
      continue;
    }
    // Drop any stray sentinel/HTML comments.
    if (/^<!--.*-->$/.test(trimmed)) continue;
    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      divider();
      continue;
    }

    // Heading: #, ##, ### …
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].replace(/\*\*/g, '').replace(/\*/g, '').trim();
      // Avoid orphaning a heading at the very bottom of a page.
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(level <= 2 ? 0.5 : 0.3);
      doc.x = left;
      const size = level === 1 ? 17 : level === 2 ? 13.5 : 12;
      const color = level <= 2 ? BRAND : BODY;
      doc.font('Helvetica-Bold').fontSize(size).fillColor(color).text(text, { width: contentWidth });
      doc.moveDown(0.25);
      continue;
    }

    // Bullet list item: hanging indent so wrapped lines align under the text.
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      const indent = 16;
      const y = doc.y;
      doc.font('Helvetica').fontSize(11).fillColor(BODY).text('•', left + 3, y, { lineBreak: false });
      doc.x = left + indent;
      doc.y = y;
      renderRich(doc, bullet[1], { width: contentWidth - indent });
      doc.x = left;
      doc.moveDown(0.2);
      continue;
    }

    // Numbered list item.
    const numbered = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      const indent = 20;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BODY).text(`${numbered[1]}.`, left + 3, y, { lineBreak: false });
      doc.x = left + indent;
      doc.y = y;
      renderRich(doc, numbered[2], { width: contentWidth - indent });
      doc.x = left;
      doc.moveDown(0.2);
      continue;
    }

    // Default paragraph.
    doc.x = left;
    renderRich(doc, trimmed, { width: contentWidth });
    doc.moveDown(0.45);
  }
}

/**
 * Generates a branded A4 PDF from markdown business document content.
 *
 * Produces a single PDF with a Hadafi-branded header banner, document metadata,
 * a separator line, the formatted document body (headings, bullets, bold, etc.),
 * and a per-page footer with page numbers. Requires `bufferPages: true` so the
 * footer page-range logic works.
 *
 * @param documentType - One of the DOCUMENT_TYPE_LABELS keys (e.g. 'business-plan').
 * @param title        - Document title displayed in the header and footer.
 * @param content      - Markdown body of the document.
 * @returns A Buffer containing the complete PDF binary.
 */
export async function generateBusinessDocumentPdf(
  documentType: string,
  title: string,
  content: string,
): Promise<Buffer> {
  const label = DOCUMENT_TYPE_LABELS[documentType] ?? 'Business Document';

  // bufferPages: true is required for doc.bufferedPageRange() used in the footer loop.
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const LEFT = 50;
  const CONTENT_WIDTH = doc.page.width - 100;

  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);

    // ── Header banner ─────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill(BRAND);
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
       .text(label, 50, 20);
    doc.fillColor('rgba(255,255,255,0.85)').fontSize(13).font('Helvetica')
       .text(title || label, 50, 52);

    // ── Meta info ─────────────────────────────────────────────────────────────
    doc.moveDown(3);
    doc.fillColor('#6b7280').fontSize(11).font('Helvetica')
       .text('Generated by Hadafi AI Business Assistant — potential.com');
    doc.moveDown(0.5);
    doc.fillColor('#9CA3AF').fontSize(10)
       .text(
         new Date().toLocaleDateString('en-GB', {
           year: 'numeric',
           month: 'long',
           day: 'numeric',
         }),
       );
    doc.moveDown(2);

    // ── Separator line ────────────────────────────────────────────────────────
    doc.moveTo(LEFT, doc.y)
       .lineTo(doc.page.width - LEFT, doc.y)
       .strokeColor(DIVIDER)
       .lineWidth(1)
       .stroke();
    doc.moveDown(1.5);

    // ── Document content (markdown-formatted) ─────────────────────────────────
    doc.x = LEFT;
    renderMarkdownBody(doc, content, LEFT, CONTENT_WIDTH);

    // ── Footer on every page ──────────────────────────────────────────────────
    // Must be called after all content is written so page count is final.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fillColor('#9CA3AF').fontSize(9).font('Helvetica')
         .text(
           `Generated with Hadafi AI Business Assistant — potential.com    ·    Page ${i + 1} of ${range.count}`,
           50,
           doc.page.height - 30,
           { align: 'center', width: doc.page.width - 100 },
         );
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
  });

  return Buffer.concat(chunks);
}
