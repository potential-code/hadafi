import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import writeXlsxFile, { type Cell as XlsxCell, type CellObject, type Sheet } from "write-excel-file/node";
import { BRAND_HEX } from "../xlsx";
import { runQuery } from "./analytics.service";
import {
  columnLabel,
  figureAxes as sharedAxes,
  toFigureCell as toCell,
  type FigureChart,
  type ReportFigure,
  type ReportFormat,
  type ReportSpec,
} from "./report-spec";

/**
 * AI Insights reports: the conversation's figures as a Hadafi-branded PDF or
 * an Excel workbook (ported from SMEEP's ai-report.service.ts, redrawn on
 * pdfkit because Hadafi ships pdfkit, not pdf-lib).
 *
 * Every figure is RE-RUN here from its own SELECT, through the same guard and
 * read-only executor as the chat's queries. The browser sends what to ask,
 * never the answers, so a number in a downloaded report can only be one the
 * data actually returned.
 */

/** Hadafi's report time zone (the programme runs from the UAE). */
const REPORT_TIME_ZONE = "Asia/Dubai";
const SOURCE = "Hadafi platform data (pseudonymised)";

/**
 * server/assets. This file sits in services/ai-sql/ under Bun, so assets are
 * two levels up; in the esbuild bundle `__dirname` is `dist/` and the Docker
 * image copies assets next to it, one level up.
 */
function assetsDir(): string {
  const candidates = [
    path.join(__dirname, "..", "..", "assets"),
    path.join(__dirname, "..", "assets"),
    path.join(process.cwd(), "assets"),
    path.join(process.cwd(), "server", "assets"),
  ];
  return candidates.find((dir) => existsSync(path.join(dir, "hadafi-logo.png"))) ?? candidates[0]!;
}

interface Assets {
  regular: Buffer;
  bold: Buffer;
  logo: Buffer;
  logoSize: { width: number; height: number };
}

let assets: Assets | null = null;

/** A PNG's pixel size, from its IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.toString("ascii", 12, 16) !== "IHDR") throw new Error("Report logo is not a PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Read once, on the first report: a missing file fails the report, never the boot. */
function loadAssets(): Assets {
  if (!assets) {
    const dir = assetsDir();
    const logo = readFileSync(path.join(dir, "hadafi-logo.png"));
    assets = {
      // Geist (SIL Open Font License, see assets/fonts/OFL-Geist.txt), the
      // typeface the Hadafi web app itself uses. No SemiBold ships: Bold stands in.
      regular: readFileSync(path.join(dir, "fonts", "Geist-Regular.ttf")),
      bold: readFileSync(path.join(dir, "fonts", "Geist-Bold.ttf")),
      logo,
      logoSize: pngSize(logo),
    };
  }
  return assets;
}

type Cell = string | number | null;

export interface ResolvedFigure {
  figure: ReportFigure;
  columns: string[];
  rows: Cell[][];
  source: string;
}

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** Re-runs one figure's SELECT. Throws the guard's 400 or the executor's error. */
export async function resolveFigure(figure: ReportFigure): Promise<ResolvedFigure> {
  const result = await runQuery(figure.sql);
  return {
    figure,
    columns: result.columns,
    rows: result.rows.map((row) => row.map(toCell)),
    source: SOURCE,
  };
}

export function figureAxes(resolved: ResolvedFigure): { x: number; y: number[] } {
  return sharedAxes(resolved.columns, resolved.rows, resolved.figure);
}

/**
 * The formula guard for anything a spreadsheet will open: a cell starting
 * with `= + - @` (or a tab/CR) is a formula to Excel and Sheets, so a course
 * title like `=HYPERLINK(...)` would otherwise run on the reader's machine.
 */
export function guardFormula(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

// client/app/globals.css: the Hadafi brand.
const BRAND = BRAND_HEX; // --ui-brand; white on it is 5.3:1
const BRAND_DEEP = "#8E0A4E"; // a deeper --ui-brand-hover, for a fourth series
const VIOLET = "#4C1D6E"; // --color-brand-violet; the second series
const ACCENT = "#F0338A"; // --color-brand-primary-light; third series only
const SURFACE = "#FDEDF5"; // --ui-brand-soft
const SURFACE_2 = "#F7E8F0"; // --color-brand-surface-2
const INK = "#17171C"; // --ui-text
const MUTED = "#5B5B67"; // --ui-muted
const RULE = "#E5E5EA"; // --ui-line
const WHITE = "#FFFFFF";
/** Brand leads, violet answers, accent and deep brand only past two series. */
const SERIES = [BRAND, VIOLET, ACCENT, BRAND_DEEP];
const DONUT = [BRAND, VIOLET, ACCENT, BRAND_DEEP, "#A99BB5", "#D9B8C9"];

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 54;
const CONTENT = A4.width - MARGIN * 2;

/** pdfkit font aliases, registered per document. */
type Font = "book" | "bold";
interface Fonts {
  book: Font;
  semibold: Font;
  bold: Font;
}

type Doc = InstanceType<typeof PDFDocument>;

/**
 * The drawing surface. SMEEP's layout measures y upward from the page's
 * bottom edge (pdf-lib's convention); pdfkit measures downward from the top.
 * Every call here takes the bottom-up coordinates and flips them, so the
 * layout code below reads as the original.
 */
class Canvas {
  constructor(readonly doc: Doc) {}

  private flip(y: number): number {
    return A4.height - y;
  }

  width(text: string, font: Font, size: number): number {
    return this.doc.font(font).fontSize(size).widthOfString(text);
  }

  /** `y` is the text's baseline. */
  text(text: string, o: { x: number; y: number; size: number; font: Font; color: string }): void {
    this.doc
      .font(o.font)
      .fontSize(o.size)
      .fillColor(o.color)
      .text(text, o.x, this.flip(o.y), { lineBreak: false, baseline: "alphabetic" });
  }

  /** `y` is the rectangle's bottom edge. */
  rect(o: { x: number; y: number; width: number; height: number; color: string }): void {
    this.doc.rect(o.x, this.flip(o.y + o.height), o.width, o.height).fill(o.color);
  }

  line(o: { start: { x: number; y: number }; end: { x: number; y: number }; thickness: number; color: string }): void {
    this.doc
      .moveTo(o.start.x, this.flip(o.start.y))
      .lineTo(o.end.x, this.flip(o.end.y))
      .lineWidth(o.thickness)
      .strokeColor(o.color)
      .stroke();
  }

  circle(o: { x: number; y: number; size: number; color: string }): void {
    this.doc.circle(o.x, this.flip(o.y), o.size).fill(o.color);
  }

  /** An SVG path already in pdfkit's top-down page coordinates. */
  path(d: string, color: string): void {
    this.doc.path(d).fill(color);
  }

  /** `y` is the image's bottom edge. */
  image(data: Buffer, o: { x: number; y: number; width: number; height: number }): void {
    this.doc.image(data, o.x, this.flip(o.y + o.height), { width: o.width, height: o.height });
  }
}

/** Markdown the model writes, reduced to what a printed page shows. */
function plain(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) =>
          line
            .replace(/^#{1,6}\s+/, "")
            .replace(/^\s*[-*]\s+/, "• ")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/__(.+?)__/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            .trim(),
        )
        .join("\n"),
    )
    .filter((p) => p.trim());
}

function wrap(c: Canvas, text: string, font: Font, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const hard of text.split("\n")) {
    let line = "";
    for (const word of hard.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (c.width(candidate, font, size) <= width || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function fit(c: Canvas, text: string, font: Font, size: number, width: number): string {
  if (c.width(text, font, size) <= width) return text;
  let cut = text;
  while (cut.length > 1 && c.width(`${cut}…`, font, size) > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function formatNumber(value: Cell): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return dayLabel(value);
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString("en-GB")
      : value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  }
  return value === null ? "—" : String(value);
}

/**
 * A round ceiling for an axis with four gridlines: each step is 1, 2 or 5
 * times a power of ten, so counts get whole-number ticks (4, not 3.8).
 */
function niceMax(max: number): number {
  if (max <= 0) return 4;
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const step of [1, 2, 5, 10]) if (step * power >= raw) return step * power * 4;
  return 40 * power;
}

/** Category codes from the ai views ("blended_learning") read as words in charts. */
function humanLabel(value: string): string {
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(value)) return value;
  return value
    .split("_")
    .map((w) => (w.length > 2 || w === "ai" ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace(/\bAi\b/g, "AI");
}

class Layout {
  readonly page: Canvas;
  y = 0;
  pageNumber = 0;

  constructor(
    readonly doc: Doc,
    readonly fonts: Fonts,
    readonly logo: Assets,
    readonly title: string,
  ) {
    this.page = new Canvas(doc);
  }

  /** The logo scaled to fit a box, keeping its aspect ratio. */
  logoFit(maxWidth: number, maxHeight: number): { width: number; height: number } {
    const { width, height } = this.logo.logoSize;
    const scale = Math.min(maxWidth / width, maxHeight / height);
    return { width: width * scale, height: height * scale };
  }

  newPage(): void {
    this.doc.addPage({ size: [A4.width, A4.height], margin: 0 });
    this.pageNumber += 1;
    if (this.pageNumber > 1) {
      // A running head on every page after the cover, so a loose page still says what it is.
      const mark = this.logoFit(84, 18);
      this.page.image(this.logo.logo, { x: MARGIN, y: A4.height - 40 - mark.height, ...mark });
      const head = fit(this.page, this.title, this.fonts.book, 8.5, 300);
      this.page.text(head, {
        x: A4.width - MARGIN - this.page.width(head, this.fonts.book, 8.5),
        y: A4.height - 50,
        size: 8.5,
        font: this.fonts.book,
        color: MUTED,
      });
      this.page.line({
        start: { x: MARGIN, y: A4.height - 64 },
        end: { x: A4.width - MARGIN, y: A4.height - 64 },
        thickness: 0.6,
        color: RULE,
      });
      this.y = A4.height - 92;
    }
  }

  /** Starts a new page when fewer than `height` points remain above the footer. */
  ensure(height: number): void {
    if (this.y - height < MARGIN + 30) this.newPage();
  }

  text(content: string, opts: { size: number; font: Font; color?: string; gap?: number; leading?: number }) {
    const leading = opts.leading ?? opts.size * 1.45;
    for (const line of wrap(this.page, content, opts.font, opts.size, CONTENT)) {
      this.ensure(leading);
      this.page.text(line, {
        x: MARGIN,
        y: this.y - opts.size,
        size: opts.size,
        font: opts.font,
        color: opts.color ?? INK,
      });
      this.y -= leading;
    }
    this.y -= opts.gap ?? 0;
  }
}

/* ---- charts: each draws into a box whose top-left is (left, top) ---- */

function yGrid(l: Layout, max: number, axisLeft: number, plotWidth: number, base: number, plotHeight: number) {
  const { page, fonts } = l;
  for (let step = 0; step <= 4; step++) {
    const gy = base + (plotHeight / 4) * step;
    page.line({ start: { x: axisLeft, y: gy }, end: { x: axisLeft + plotWidth, y: gy }, thickness: 0.4, color: RULE });
    const label = formatNumber(Math.round((max / 4) * step * 10) / 10);
    page.text(label, {
      x: axisLeft - 6 - page.width(label, fonts.book, 7),
      y: gy - 2.5,
      size: 7,
      font: fonts.book,
      color: MUTED,
    });
  }
}

function drawBars(l: Layout, r: ResolvedFigure, left: number, top: number, width: number, height: number) {
  const { x, y } = figureAxes(r);
  const rows = r.rows.slice(0, 12);
  const { page, fonts } = l;
  const max = niceMax(Math.max(0, ...rows.flatMap((row) => y.map((i) => Number(row[i]) || 0))));
  const axisLeft = left + 34;
  const plotWidth = width - 34;
  const plotHeight = height - 34;
  const base = top - plotHeight;
  yGrid(l, max, axisLeft, plotWidth, base, plotHeight);

  const slot = plotWidth / Math.max(rows.length, 1);
  const barWidth = Math.min(26, (slot * 0.7) / Math.max(y.length, 1));
  rows.forEach((row, i) => {
    const groupLeft = axisLeft + slot * i + (slot - barWidth * y.length) / 2;
    y.forEach((col, s) => {
      const h = ((Number(row[col]) || 0) / max) * plotHeight;
      page.rect({ x: groupLeft + barWidth * s, y: base, width: barWidth - 1, height: Math.max(h, 0.5), color: SERIES[s]! });
    });
    // "Masterclass 2 — Personal Branding…" is "Masterclass 2" under a bar, and
    // a date is "27 Jul", not Postgres's timestamp.
    const raw = humanLabel(String(row[x] ?? ""));
    const short = /^\d{4}-\d{2}-\d{2}/.test(raw) ? dayLabel(raw).replace(/ \d{4}$/, "") : raw.split(/\s+[—–-]\s+|:\s/)[0]!;
    const label = fit(page, short, fonts.book, 7, slot - 4);
    page.text(label, {
      x: axisLeft + slot * i + (slot - page.width(label, fonts.book, 7)) / 2,
      y: base - 12,
      size: 7,
      font: fonts.book,
      color: MUTED,
    });
  });
  legend(l, r, y, left, base - 28);
}

function drawHorizontalBars(l: Layout, r: ResolvedFigure, left: number, top: number, width: number) {
  const { x, y } = figureAxes(r);
  const value = y[0] ?? -1;
  // Biggest first, as in the chat: a ranking in the order the data arrived is not a ranking.
  const rows = [...r.rows].sort((a, b) => (Number(b[value]) || 0) - (Number(a[value]) || 0)).slice(0, 15);
  const { page, fonts } = l;
  const max = niceMax(Math.max(0, ...rows.map((row) => Number(row[value]) || 0)));
  const labelWidth = 150;
  const barMax = width - labelWidth - 50;
  rows.forEach((row, i) => {
    const rowTop = top - i * 18;
    page.text(fit(page, humanLabel(formatNumber(row[x] ?? "")), fonts.book, 8.5, labelWidth - 8), {
      x: left,
      y: rowTop - 11,
      size: 8.5,
      font: fonts.book,
      color: INK,
    });
    const w = ((Number(row[value]) || 0) / max) * barMax;
    page.rect({ x: left + labelWidth, y: rowTop - 13, width: barMax, height: 10, color: SURFACE_2 });
    page.rect({ x: left + labelWidth, y: rowTop - 13, width: Math.max(w, 0.5), height: 10, color: i === 0 ? BRAND : VIOLET });
    page.text(formatNumber(row[value] ?? null), {
      x: left + labelWidth + barMax + 6,
      y: rowTop - 11,
      size: 8.5,
      font: fonts.semibold,
      color: INK,
    });
  });
  return rows.length * 18;
}

function drawLine(l: Layout, r: ResolvedFigure, left: number, top: number, width: number, height: number) {
  const { x, y } = figureAxes(r);
  const rows = r.rows.slice(0, 120);
  const { page, fonts } = l;
  const max = niceMax(Math.max(0, ...rows.flatMap((row) => y.map((i) => Number(row[i]) || 0))));
  const axisLeft = left + 34;
  const plotWidth = width - 34;
  const plotHeight = height - 34;
  const base = top - plotHeight;
  yGrid(l, max, axisLeft, plotWidth, base, plotHeight);
  const px = (i: number) => axisLeft + (rows.length <= 1 ? plotWidth / 2 : (plotWidth * i) / (rows.length - 1));
  y.forEach((col, s) => {
    const points = rows.map((row, i) => ({ x: px(i), y: base + ((Number(row[col]) || 0) / max) * plotHeight }));
    for (let i = 1; i < points.length; i++) {
      page.line({ start: points[i - 1]!, end: points[i]!, thickness: 1.6, color: SERIES[s]! });
    }
    if (points.length <= 31) points.forEach((p) => page.circle({ x: p.x, y: p.y, size: 1.6, color: SERIES[s]! }));
  });
  const every = Math.max(1, Math.ceil(rows.length / 7));
  // The last point is always labelled; a label that would run into the one
  // before it is dropped rather than drawn over it.
  let lastRight = -Infinity;
  rows.forEach((row, i) => {
    if (i % every !== 0 && i !== rows.length - 1) return;
    const raw = humanLabel(String(row[x] ?? ""));
    const label = /^\d{4}-\d{2}-\d{2}/.test(raw) ? dayLabel(raw).replace(/ \d{4}$/, "") : fit(page, raw, fonts.book, 7, 60);
    const w = page.width(label, fonts.book, 7);
    const lx = px(i) - w / 2;
    if (lx < lastRight + 6) return;
    page.text(label, { x: lx, y: base - 12, size: 7, font: fonts.book, color: MUTED });
    lastRight = lx + w;
  });
  legend(l, r, y, left, base - 28);
}

function legend(l: Layout, r: ResolvedFigure, y: number[], left: number, at: number) {
  if (y.length < 2) return;
  let cursor = left + 34;
  y.forEach((col, s) => {
    l.page.rect({ x: cursor, y: at + 1, width: 8, height: 8, color: SERIES[s]! });
    const label = columnLabel(r.columns[col] ?? "");
    l.page.text(label, { x: cursor + 12, y: at + 2, size: 7.5, font: l.fonts.book, color: INK });
    cursor += 24 + l.page.width(label, l.fonts.book, 7.5);
  });
}

/** A ring segment in SVG (y-down) coordinates, angles clockwise from 3 o'clock. */
function arcPath(cx: number, cy: number, outer: number, inner: number, from: number, to: number): string {
  const point = (radius: number, angle: number) =>
    `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  const large = to - from > Math.PI ? 1 : 0;
  return [
    `M ${point(outer, from)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${point(outer, to)}`,
    `L ${point(inner, to)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${point(inner, from)}`,
    "Z",
  ].join(" ");
}

function drawDonut(l: Layout, r: ResolvedFigure, left: number, top: number) {
  const { x, y } = figureAxes(r);
  const value = y[0] ?? -1;
  const sorted = [...r.rows].sort((a, b) => (Number(b[value]) || 0) - (Number(a[value]) || 0));
  const slices = sorted.slice(0, 5).map((row) => ({ label: humanLabel(String(row[x] ?? "")), value: Number(row[value]) || 0 }));
  const rest = sorted.slice(5).reduce((sum, row) => sum + (Number(row[value]) || 0), 0);
  if (rest > 0) slices.push({ label: "Other", value: rest });
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;

  const size = 150;
  // The ring's centre in pdfkit's top-down page coordinates.
  const cx = left + size / 2;
  const cy = A4.height - top + size / 2;
  let angle = -Math.PI / 2;
  slices.forEach((slice, i) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    if (sweep <= 0) return;
    const end = angle + Math.min(sweep, Math.PI * 2 - 0.0001);
    l.page.path(arcPath(cx, cy, size / 2, size / 2 - 26, angle, end), DONUT[i % DONUT.length]!);
    angle = end;
  });
  const totalLabel = formatNumber(total);
  l.page.text(totalLabel, {
    x: left + size / 2 - l.page.width(totalLabel, l.fonts.bold, 15) / 2,
    y: top - size / 2 - 5,
    size: 15,
    font: l.fonts.bold,
    color: INK,
  });

  const legendLeft = left + size + 36;
  slices.forEach((slice, i) => {
    const rowTop = top - 18 - i * 20;
    l.page.rect({ x: legendLeft, y: rowTop, width: 9, height: 9, color: DONUT[i % DONUT.length]! });
    l.page.text(fit(l.page, slice.label, l.fonts.book, 9, 170), { x: legendLeft + 15, y: rowTop + 1, size: 9, font: l.fonts.book, color: INK });
    const figure = `${formatNumber(slice.value)}  ·  ${Math.round((slice.value / total) * 100)}%`;
    l.page.text(figure, {
      x: legendLeft + 300 - 36 - l.page.width(figure, l.fonts.semibold, 9),
      y: rowTop + 1,
      size: 9,
      font: l.fonts.semibold,
      color: INK,
    });
  });
}

function drawStats(l: Layout, r: ResolvedFigure, left: number, top: number, width: number) {
  const row = r.rows[0] ?? [];
  const items = r.columns
    .map((column, i) => ({ label: columnLabel(column), value: row[i] ?? null }))
    .filter((item) => typeof item.value === "number")
    .slice(0, 4);
  const cell = width / Math.max(items.length, 1);
  items.forEach((item, i) => {
    const x = left + cell * i;
    l.page.rect({ x: x + 2, y: top - 62, width: cell - 8, height: 62, color: i === 0 ? BRAND : SURFACE });
    const text = fit(l.page, formatNumber(item.value), l.fonts.bold, 20, cell - 28);
    l.page.text(text, { x: x + 14, y: top - 32, size: 20, font: l.fonts.bold, color: i === 0 ? WHITE : INK });
    l.page.text(fit(l.page, item.label, l.fonts.book, 8.5, cell - 28), {
      x: x + 14,
      y: top - 50,
      size: 8.5,
      font: l.fonts.book,
      color: i === 0 ? SURFACE_2 : MUTED,
    });
  });
}

function drawTable(l: Layout, r: ResolvedFigure) {
  const columns = r.columns.slice(0, 6);
  const rows = r.rows.slice(0, 30);
  const numeric = columns.map((_, i) => rows.some((row) => typeof row[i] === "number"));
  const textColumns = numeric.filter((n) => !n).length;
  const numberWidth = textColumns ? 104 : CONTENT / Math.max(columns.length, 1);
  const textWidth = textColumns ? (CONTENT - numberWidth * (columns.length - textColumns)) / textColumns : 0;
  const widths = numeric.map((n) => (n ? numberWidth : textWidth));

  const drawRow = (cells: string[], header: boolean, zebra: boolean) => {
    l.ensure(18);
    if (zebra) l.page.rect({ x: MARGIN, y: l.y - 16, width: CONTENT, height: 16, color: SURFACE });
    let x = MARGIN;
    cells.forEach((value, i) => {
      const font = header ? l.fonts.semibold : l.fonts.book;
      const size = header ? 7.5 : 8.5;
      const width = widths[i]!;
      const text = fit(l.page, value, font, size, width - 10);
      const tx = numeric[i] ? x + width - 6 - l.page.width(text, font, size) : x + 6;
      l.page.text(text, { x: tx, y: l.y - 11, size, font, color: header ? MUTED : INK });
      x += width;
    });
    l.y -= 16;
    if (header) {
      l.page.line({ start: { x: MARGIN, y: l.y }, end: { x: MARGIN + CONTENT, y: l.y }, thickness: 0.8, color: BRAND });
    }
  };

  drawRow(columns.map((c) => columnLabel(c).toUpperCase()), true, false);
  rows.forEach((row, i) => drawRow(columns.map((_, c) => formatNumber(row[c] ?? null)), false, i % 2 === 1));
  l.y -= 6;
  if (r.rows.length > rows.length) {
    l.text(`The first ${rows.length} of ${r.rows.length} rows are shown; the Excel download carries all of them.`, {
      size: 7.5,
      font: l.fonts.book,
      color: MUTED,
    });
  }
}

const CHART_HEIGHT: Record<FigureChart, number> = {
  bar: 210,
  horizontal_bar: 0,
  line: 210,
  donut: 160,
  stat: 70,
  table: 0,
};

function drawFigure(l: Layout, r: ResolvedFigure) {
  const { figure } = r;
  // A vertical bar chart of many categories is unreadable on a page (the
  // labels collide), so it turns on its side past eight.
  const { x } = figureAxes(r);
  const dated = r.rows.some((row) => typeof row[x] === "string" && /^\d{4}-\d{2}-\d{2}/.test(row[x] as string));
  const chart: FigureChart =
    figure.chart === "bar" && r.rows.length > 8 && !dated ? "horizontal_bar" : figure.chart;
  const bodyHeight =
    chart === "horizontal_bar"
      ? Math.min(r.rows.length, 15) * 18
      : chart === "table"
        ? Math.min(r.rows.length + 1, 31) * 16
        : CHART_HEIGHT[chart];

  l.ensure(Math.min(bodyHeight, 260) + 56);
  // "Figure 3" sits in the title line, in brand pink, because the summary and
  // the section text refer to figures by number: it is a reference, not a label.
  const label = `Figure ${figure.number}  `;
  l.page.text(label, { x: MARGIN, y: l.y - 11.5, size: 11.5, font: l.fonts.semibold, color: BRAND });
  const labelWidth = l.page.width(label, l.fonts.semibold, 11.5);
  l.page.text(fit(l.page, figure.title, l.fonts.semibold, 11.5, CONTENT - labelWidth), {
    x: MARGIN + labelWidth,
    y: l.y - 11.5,
    size: 11.5,
    font: l.fonts.semibold,
    color: INK,
  });
  l.y -= 22;

  if (r.rows.length === 0) {
    l.text("No rows: the data holds nothing for this question yet.", { size: 9, font: l.fonts.book, color: MUTED });
  } else if (chart === "table") {
    drawTable(l, r);
  } else {
    const top = l.y - 4;
    if (chart === "bar") drawBars(l, r, MARGIN, top, CONTENT, CHART_HEIGHT.bar);
    if (chart === "line") drawLine(l, r, MARGIN, top, CONTENT, CHART_HEIGHT.line);
    if (chart === "donut") drawDonut(l, r, MARGIN, top);
    if (chart === "stat") drawStats(l, r, MARGIN, top, CONTENT);
    if (chart === "horizontal_bar") drawHorizontalBars(l, r, MARGIN, top, CONTENT);
    l.y = top - bodyHeight - (chart === "bar" || chart === "line" ? 18 : 6);
  }
  l.text(`Source: ${r.source}`, { size: 7.5, font: l.fonts.book, color: MUTED, gap: 18 });
}

function preparedStamp(generatedAt: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: REPORT_TIME_ZONE,
  }).format(generatedAt);
}

function drawCover(l: Layout, spec: ReportSpec, generatedAt: Date) {
  const { page, fonts } = l;
  // A brand band across the top edge, then the logo: the cover reads as
  // Hadafi at a glance, as the app's own header does.
  page.rect({ x: 0, y: A4.height - 10, width: A4.width, height: 10, color: BRAND });
  page.rect({ x: A4.width * 0.62, y: A4.height - 10, width: A4.width * 0.38, height: 10, color: VIOLET });
  const mark = l.logoFit(132, 30);
  page.image(l.logo.logo, { x: MARGIN, y: A4.height - 58 - mark.height, ...mark });

  l.y = A4.height - 132;
  l.text("Hadafi Women Entrepreneurship Program", { size: 9.5, font: fonts.semibold, color: BRAND, gap: 6 });
  l.text(spec.title, { size: 24, font: fonts.bold, leading: 29, gap: 6 });
  l.text(`AI Insights report · prepared ${preparedStamp(generatedAt)} (UAE time)`, {
    size: 8.5,
    font: fonts.book,
    color: MUTED,
    gap: 16,
  });
  page.rect({ x: MARGIN, y: l.y, width: 36, height: 2.5, color: BRAND });
  l.y -= 22;
  for (const paragraph of plain(spec.summary)) {
    l.text(paragraph, { size: 11, font: fonts.book, leading: 16.5, gap: 8 });
  }
  l.y -= 10;
}

function drawFooters(doc: Doc, fonts: Fonts) {
  const page = new Canvas(doc);
  const range = doc.bufferedPageRange();
  const note =
    "Hadafi Women Entrepreneurship Program · every figure is re-run from its query in AI Insights · learner data is pseudonymised.";
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    page.line({ start: { x: MARGIN, y: 44 }, end: { x: A4.width - MARGIN, y: 44 }, thickness: 0.5, color: RULE });
    page.text(fit(page, note, fonts.book, 6.5, CONTENT - 50), { x: MARGIN, y: 32, size: 6.5, font: fonts.book, color: MUTED });
    const number = `${i + 1} / ${range.count}`;
    page.text(number, {
      x: A4.width - MARGIN - page.width(number, fonts.semibold, 7.5),
      y: 32,
      size: 7.5,
      font: fonts.semibold,
      color: INK,
    });
  }
}

export async function renderReportPdf(
  spec: ReportSpec,
  figures: ResolvedFigure[][],
  generatedAt = new Date(),
): Promise<Buffer> {
  const files = loadAssets();
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    margin: 0,
    info: { Title: spec.title, Author: "Hadafi AI Insights", Creator: "Hadafi Women Entrepreneurship Program" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  // pdfkit subsets embedded fonts itself: a report carries only the glyphs it uses.
  doc.registerFont("book", files.regular);
  doc.registerFont("bold", files.bold);
  const fonts: Fonts = { book: "book", semibold: "bold", bold: "bold" };

  const layout = new Layout(doc, fonts, files, spec.title);
  layout.newPage();
  drawCover(layout, spec, generatedAt);

  spec.sections.forEach((section, s) => {
    // A heading never ends a page alone: it moves with its text and, when the
    // section has one, its first figure.
    layout.ensure(section.figures.length ? 340 : 90);
    layout.text(section.heading, { size: 15, font: fonts.bold, leading: 20, gap: 4 });
    for (const paragraph of plain(section.body)) {
      layout.text(paragraph, { size: 10, font: fonts.book, leading: 15, gap: 7 });
    }
    layout.y -= 6;
    for (const figure of figures[s] ?? []) drawFigure(layout, figure);
    layout.y -= 8;
  });

  drawFooters(doc, fonts);
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

/** Excel refuses a sheet name over 31 characters or carrying []:*?/\ */
function sheetName(figure: ReportFigure, used: Set<string>): string {
  const base = `Fig ${figure.number} ${figure.title}`.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim();
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base.slice(0, 27)} (${n})`;
  used.add(name);
  return name;
}

export async function renderReportXlsx(
  spec: ReportSpec,
  figures: ResolvedFigure[][],
  generatedAt = new Date(),
): Promise<Buffer> {
  const used = new Set<string>(["Report"]);
  // Cover text wraps in one wide column, top-aligned.
  const line = (value: string, style: Omit<CellObject, "value"> = {}): XlsxCell[] => [
    { value, wrap: true, alignVertical: "top", ...style } as XlsxCell,
  ];
  const cover: XlsxCell[][] = [
    line("Hadafi Women Entrepreneurship Program", { fontWeight: "bold", fontSize: 10, textColor: BRAND_HEX }),
    line(guardFormula(spec.title), { fontWeight: "bold", fontSize: 14 }),
    line(
      `AI Insights report · prepared ${new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: REPORT_TIME_ZONE }).format(generatedAt)} (UAE time)`,
    ),
    [],
  ];
  for (const paragraph of plain(spec.summary)) cover.push(line(guardFormula(paragraph)));

  const figureSheets: Sheet<Buffer>[] = [];
  spec.sections.forEach((section, s) => {
    cover.push([]);
    cover.push(line(guardFormula(section.heading), { fontWeight: "bold", fontSize: 12 }));
    for (const paragraph of plain(section.body)) cover.push(line(guardFormula(paragraph)));
    for (const resolved of figures[s] ?? []) {
      const name = sheetName(resolved.figure, used);
      cover.push(line(guardFormula(`Figure ${resolved.figure.number}: ${resolved.figure.title} (see sheet "${name}")`)));

      const header: XlsxCell[] = resolved.columns.map((column) => ({
        value: guardFormula(columnLabel(column)),
        fontWeight: "bold",
        textColor: "#FFFFFF",
        backgroundColor: BRAND_HEX,
      }));
      figureSheets.push({
        sheet: name,
        data: [
          [{ value: guardFormula(resolved.figure.title), fontWeight: "bold", fontSize: 12 }],
          [guardFormula(`Source: ${resolved.source}`)],
          [],
          header,
          ...resolved.rows.map((row) => row.map((value) => (typeof value === "string" ? guardFormula(value) : value))),
          [],
          [{ value: "The query behind this figure:", fontStyle: "italic" }],
          [guardFormula(resolved.figure.sql)],
        ],
        columns: Array.from({ length: Math.max(1, resolved.columns.length) }, (_, i) => ({ width: i === 0 ? 40 : 16 })),
        // Title, source, a gap and the header stay in view while scrolling.
        stickyRowsCount: 4,
      });
    }
  });

  return writeXlsxFile([{ sheet: "Report", data: cover, columns: [{ width: 110 }] }, ...figureSheets]).toBuffer();
}

/** "hadafi-report-2026-10-02": the date the report was prepared, UAE time. */
export function reportFileStem(generatedAt: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: REPORT_TIME_ZONE,
  }).format(generatedAt);
  return `hadafi-report-${parts}`;
}

/** Renders already-resolved figures: pure, no database. `figures[s]` are section s's figures. */
export async function renderReport(
  spec: ReportSpec,
  figures: ResolvedFigure[][],
  format: ReportFormat,
  generatedAt: Date = new Date(),
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  const stem = reportFileStem(generatedAt);
  if (format === "xlsx") {
    return {
      buffer: await renderReportXlsx(spec, figures, generatedAt),
      fileName: `${stem}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  return {
    buffer: await renderReportPdf(spec, figures, generatedAt),
    fileName: `${stem}.pdf`,
    contentType: "application/pdf",
  };
}

/** The route's whole job: re-run every figure, then render the format asked for. */
export async function buildReport(
  spec: ReportSpec,
  format: ReportFormat,
  resolve: (figure: ReportFigure) => Promise<ResolvedFigure> = resolveFigure,
  generatedAt: Date = new Date(),
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  const figures = await Promise.all(spec.sections.map((section) => Promise.all(section.figures.map(resolve))));
  return renderReport(spec, figures, format, generatedAt);
}
