'use client'

/**
 * The report Hana assembled, as it sits in the transcript: the title, what it
 * holds, and the two downloads. The files are built on the server from each
 * figure's own SQL, re-run at download time; nothing here is the data itself.
 */
import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { btn } from '@/components/kit'
import { downloadAiReport } from '@/lib/api/adminAi'
import { cn } from '@/lib/utils'
import { figureByNumber, firstEntrance, toReportFigure, useReport, type Figure } from './figure-store'

export function ReportCard({ toolCallId }: { toolCallId: string }) {
  const report = useReport(toolCallId)
  const rise = useMemo(() => Boolean(report) && firstEntrance(`report:${toolCallId}`), [report, toolCallId])
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!report) return null

  const figureCount = report.sections.reduce((n, s) => n + s.figures.length, 0)

  const download = async (format: 'pdf' | 'xlsx') => {
    setBusy(format)
    setError(null)
    try {
      await downloadAiReport({
        format,
        title: report.title,
        summary: report.summary,
        sections: report.sections.map((section) => ({
          heading: section.heading,
          body: section.body,
          figures: section.figures
            .map(figureByNumber)
            .filter((figure): figure is Figure => figure?.status === 'ready')
            .map(toReportFigure),
        })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The report could not be built.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <article
      className={cn('my-2 overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui', rise && 'ai-report')}
      data-testid="ai-report"
    >
      <header className="border-b border-ui-line bg-ui-brand-soft px-4 pb-3.5 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ui-brand-text">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Report ready
        </p>
        <h3 className="mt-1 text-base font-semibold leading-snug text-ui-text [text-wrap:balance]">{report.title}</h3>
        <p className="mt-0.5 text-xs text-ui-muted">
          {report.sections.length} section{report.sections.length === 1 ? '' : 's'} · {figureCount} figure
          {figureCount === 1 ? '' : 's'} · every number is re-run when you download
        </p>
      </header>

      <ol className="space-y-1 px-4 py-3 text-[13px]">
        {report.sections.map((section, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="w-4 shrink-0 tabular-nums text-ui-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 text-ui-text">{section.heading}</span>
            {section.figures.length > 0 && (
              <span className="shrink-0 text-xs text-ui-muted">Fig. {section.figures.join(', ')}</span>
            )}
          </li>
        ))}
      </ol>

      {report.missing.length > 0 && (
        <p className="px-4 pb-2 text-xs text-ui-muted">
          Left out: figure {report.missing.join(', ')}, which was never drawn.
        </p>
      )}

      <div className="flex gap-2 border-t border-ui-line px-4 py-3">
        <button
          type="button"
          className={cn(btn({ variant: 'primary', size: 'sm' }), 'flex-1')}
          onClick={() => void download('pdf')}
          disabled={busy !== null}
        >
          {busy === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
          {busy === 'pdf' ? 'Building…' : 'Download PDF'}
        </button>
        <button
          type="button"
          className={cn(btn({ variant: 'secondary', size: 'sm' }), 'flex-1')}
          onClick={() => void download('xlsx')}
          disabled={busy !== null}
        >
          {busy === 'xlsx' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy === 'xlsx' ? 'Building…' : 'Download Excel'}
        </button>
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 text-xs text-ui-danger">
          {error}
        </p>
      )}
    </article>
  )
}
