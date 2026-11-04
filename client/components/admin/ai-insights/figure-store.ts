'use client'

/**
 * The conversation's figures and reports, outside React.
 *
 * Tool handlers run outside any component and CopilotKit remounts tool
 * renderers freely, so the data a card draws lives here, keyed by tool-call
 * id, and cards subscribe to it. Figures are numbered in the order they are
 * drawn: "Figure 3" is how Hana, the transcript and the downloaded report all
 * refer to the same chart.
 */
import { useSyncExternalStore } from 'react'
import type { FigureChart, ReportFigure } from '@/lib/api/adminAi'

export type FigureCell = string | number | null

export interface Figure {
  toolCallId: string
  number: number
  title: string
  chart: FigureChart
  x?: string
  y?: string[]
  /** What the server re-runs for a report: never the numbers themselves. */
  sql: string
  status: 'loading' | 'ready' | 'failed'
  columns: string[]
  rows: FigureCell[][]
  truncated?: boolean
  error?: string
}

export interface Report {
  toolCallId: string
  title: string
  summary: string
  sections: { heading: string; body: string; figures: number[] }[]
  /** Figure numbers Hana asked for that were never drawn: reported, not silently dropped. */
  missing: number[]
}

const figures = new Map<string, Figure>()
const reports = new Map<string, Report>()
const listeners = new Set<() => void>()
let next = 1
let version = 0

function emit() {
  version += 1
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Figure numbers follow the order the model WROTE its calls in, not the order
 * they finish. It asks for several figures in one message and CopilotKit runs
 * them at once; numbering by finish order made "Figure 3" a different chart
 * from the one the report then cited as Figure 3. A message reserves one block
 * of numbers for all its figure calls, and each call takes its place in it.
 */
const blocks = new Map<string, number>()

export function reserveNumber(place: { messageId: string; position: number; size: number } | null): number {
  if (!place) return next++
  let base = blocks.get(place.messageId)
  if (base === undefined) {
    base = next
    blocks.set(place.messageId, base)
    next += place.size
  }
  return base + place.position
}

/** Records a figure the moment its call starts, under the number its place gives it. */
export function startFigure(
  figure: Omit<Figure, 'number' | 'status' | 'columns' | 'rows'>,
  number: number = reserveNumber(null),
): Figure {
  const existing = figures.get(figure.toolCallId)
  if (existing) return existing
  const created: Figure = { ...figure, number, status: 'loading', columns: [], rows: [] }
  figures.set(figure.toolCallId, created)
  emit()
  return created
}

export function settleFigure(toolCallId: string, patch: Partial<Figure>): void {
  const current = figures.get(toolCallId)
  if (!current) return
  figures.set(toolCallId, { ...current, ...patch })
  emit()
}

export function figureByNumber(number: number): Figure | undefined {
  for (const figure of figures.values()) if (figure.number === number) return figure
  return undefined
}

export function readyFigureCount(): number {
  let count = 0
  for (const figure of figures.values()) if (figure.status === 'ready') count += 1
  return count
}

export function saveReport(report: Report): void {
  reports.set(report.toolCallId, report)
  emit()
}

/** Cards that have already made their entrance (a re-render must not replay it). */
const entered = new Set<string>()

export function firstEntrance(key: string): boolean {
  if (entered.has(key)) return false
  entered.add(key)
  return true
}

/** A new conversation starts again at Figure 1. */
export function resetFigures(): void {
  figures.clear()
  reports.clear()
  entered.clear()
  blocks.clear()
  next = 1
  emit()
}

const snapshot = () => version

export function useFigureStoreVersion(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export function useFigure(toolCallId: string): Figure | undefined {
  useFigureStoreVersion()
  return figures.get(toolCallId)
}

export function useReport(toolCallId: string): Report | undefined {
  useFigureStoreVersion()
  return reports.get(toolCallId)
}

export function useReadyFigureCount(): number {
  useFigureStoreVersion()
  return readyFigureCount()
}

/** The request the server re-runs, in the shape the report endpoint accepts. */
export function toReportFigure(figure: Figure): ReportFigure {
  return {
    source: 'programme',
    sql: figure.sql,
    number: figure.number,
    title: figure.title,
    chart: figure.chart,
    ...(figure.x ? { x: figure.x } : {}),
    ...(figure.y?.length ? { y: figure.y } : {}),
  }
}

// ── Shared with the PDF: which columns a figure draws ─────────────────────────

/** "lessons_completed" → "Lessons completed", "pass_rate_pct" → "Pass rate %". */
export function columnLabel(column: string): string {
  const words = column
    .replace(/_pct$/, ' %')
    .replace(/_seconds$/, ' (seconds)')
    .replace(/_/g, ' ')
    .trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Which column is the category and which carry values: the figure's own
 * choice first, then the first text column and every numeric one.
 */
export function figureAxes(
  columns: string[],
  rows: FigureCell[][],
  chosen: { x?: string; y?: string[] } = {},
): { x: number; y: number[] } {
  const numeric = (i: number) => rows.some((row) => typeof row[i] === 'number')
  const find = (name: string) => {
    const exact = columns.indexOf(name)
    return exact >= 0 ? exact : columns.findIndex((c) => c.toLowerCase() === name.toLowerCase())
  }
  let x = chosen.x ? find(chosen.x) : -1
  if (x < 0) x = columns.findIndex((_, i) => !numeric(i))
  if (x < 0) x = 0
  let y = (chosen.y ?? []).map(find).filter((i) => i >= 0 && i !== x)
  if (y.length === 0) y = columns.map((_, i) => i).filter((i) => i !== x && numeric(i))
  return { x, y: y.slice(0, 3) }
}

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/

/** bigint and numeric arrive from Postgres as strings; a chart needs numbers. */
export function toFigureCell(value: unknown): FigureCell {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const text = String(value)
  return NUMERIC_TEXT.test(text) ? Number(text) : text
}
