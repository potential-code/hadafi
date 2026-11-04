import { inflateRawSync } from "node:zlib";
import mammoth from "mammoth";
import { getDocumentProxy } from "unpdf";

/**
 * Reads the text out of a document a learner shares with Ask Hana, so Hana can
 * answer from it. Nothing is stored: the file is read in memory and only its
 * text goes back to the browser, which sends it with the learner's next
 * message.
 */

export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
/** What Hana reads of a document: enough for a business plan, not a book. */
export const DOCUMENT_MAX_CHARS = 20_000;
/** The most a Word file's XML may unpack to. Real documents are well under 2 MB. */
export const DOCX_MAX_XML_BYTES = 10 * 1024 * 1024;
/** PDF pages read at most; reading stops sooner once there's enough text. */
export const PDF_MAX_PAGES = 200;
/** How long reading a PDF's pages may take before it stops with what it has. */
export const PDF_MAX_MS = 10_000;

export type DocumentKind = "pdf" | "docx" | "text";

export type DocumentText = {
  name: string;
  kind: DocumentKind;
  size: number;
  /** The document's text, cut to DOCUMENT_MAX_CHARS. */
  text: string;
  truncated: boolean;
  pages?: number;
};

export class DocumentReadError extends Error {
  constructor(
    message: string,
    readonly code: "UNSUPPORTED_TYPE" | "EMPTY_DOCUMENT" | "UNREADABLE",
  ) {
    super(message);
  }
}

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv"]);

/** The kind from the file's own bytes, with the extension only telling text apart. */
export function documentKind(buffer: Buffer, filename: string): DocumentKind | null {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  // .docx is a zip; an old binary .doc is not, and isn't supported.
  if (ext === "docx" && buffer[0] === 0x50 && buffer[1] === 0x4b) return "docx";
  if (TEXT_EXTENSIONS.has(ext) && !buffer.subarray(0, 4096).includes(0)) return "text";
  return null;
}

const tooBig = () => new DocumentReadError("This file is too large or complex for Hana to read. Try a shorter version.", "UNREADABLE");

/**
 * Checks what a .docx really unpacks to before mammoth opens it. A zip can
 * claim small sizes and still inflate to gigabytes, so the XML parts (all that
 * text extraction reads) are actually inflated here with a hard output cap;
 * media is skipped. Throws if the archive is malformed or over the cap.
 */
export function assertDocxWithinLimits(buffer: Buffer): void {
  // End of central directory: in the last 64 KB + 22 bytes.
  const tail = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= tail; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw tooBig();
  const entries = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);
  if (entries > 2000 || at >= buffer.length) throw tooBig();

  let budget = DOCX_MAX_XML_BYTES;
  for (let n = 0; n < entries; n++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50) throw tooBig();
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const nameLen = buffer.readUInt16LE(at + 28);
    const extraLen = buffer.readUInt16LE(at + 30);
    const commentLen = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;

    if (!/\.(xml|rels)$/i.test(name)) continue;
    if (compressed === 0xffffffff || local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw tooBig();
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + compressed);
    let size: number;
    if (method === 0) size = data.length;
    else if (method === 8) {
      try {
        size = inflateRawSync(data, { maxOutputLength: budget }).length;
      } catch {
        throw tooBig();
      }
    } else throw tooBig();
    budget -= size;
    if (budget < 0) throw tooBig();
  }
}

/** Text of a PDF, page by page, stopping once there's enough (or it has taken too long). */
async function readPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  // unpdf's pdf.js build compiles nothing from the file (no eval), so a crafted
  // font can't run code while the PDF is read.
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const parts: string[] = [];
    let length = 0;
    const last = Math.min(pdf.numPages, PDF_MAX_PAGES);
    const started = Date.now();
    for (let i = 1; i <= last && length <= DOCUMENT_MAX_CHARS && Date.now() - started < PDF_MAX_MS; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      parts.push(text);
      length += text.length;
    }
    return { text: parts.join("\n"), pages: pdf.numPages };
  } finally {
    // Frees the parsed document (and its worker state) straight away.
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function readDocumentText(buffer: Buffer, filename: string): Promise<DocumentText> {
  const kind = documentKind(buffer, filename);
  if (!kind) {
    throw new DocumentReadError("Hana can read PDF, Word (.docx), text, Markdown and CSV files.", "UNSUPPORTED_TYPE");
  }

  let raw: string;
  let pages: number | undefined;
  try {
    if (kind === "pdf") {
      const result = await readPdfText(buffer);
      raw = result.text;
      pages = result.pages;
    } else if (kind === "docx") {
      assertDocxWithinLimits(buffer);
      raw = (await mammoth.extractRawText({ buffer })).value;
    } else {
      raw = buffer.toString("utf8");
    }
  } catch (err) {
    if (err instanceof DocumentReadError) throw err;
    throw new DocumentReadError("This file couldn't be read. It may be damaged or password-protected.", "UNREADABLE");
  }

  const text = tidy(raw);
  if (!text) {
    throw new DocumentReadError(
      kind === "pdf"
        ? "This PDF has no text Hana can read (it may be a scan)."
        : "This file is empty.",
      "EMPTY_DOCUMENT",
    );
  }

  const truncated = text.length > DOCUMENT_MAX_CHARS;
  return {
    name: filename,
    kind,
    size: buffer.length,
    text: truncated ? text.slice(0, DOCUMENT_MAX_CHARS) : text,
    truncated,
    ...(pages ? { pages } : {}),
  };
}
