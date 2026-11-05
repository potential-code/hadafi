'use client'

/**
 * AI Dashboard: describe the dashboard you want and Hana builds it. The
 * `dashboardBuilder` agent writes a SELECT against Hadafi's reporting views,
 * picks a chart shape from the columns it gets back, and emits a spec; the
 * browser runs that statement through `/api/admin/ai/query` and draws the
 * rows. Saved dashboards persist SPECS only: every viewer re-runs them.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Select } from '@/components/admin/ui'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { AiChartCard } from '@/components/admin/ai-dashboard/AiChartCard'
import { specCacheKey } from '@/components/admin/ai-dashboard/chartData'
import type { ChartInstance } from '@/components/admin/ai-dashboard/DashboardAssistant'
import '@/components/admin/ai-shared/admin-ai.css'
import { btn, EmptyState, inputClass, PageHeader, Skeleton } from '@/components/kit'
import {
  aiDashboardKeys,
  createAiDashboard,
  deleteAiDashboard,
  fetchAiCatalog,
  isAiChartSpec,
  isAiNotSetUp,
  listAiDashboards,
  runAiSql,
  sqlErrorMessage,
  updateAiDashboard,
  type AiChartSpec,
  type AiDashboard,
} from '@/lib/api/adminAi'
import { cn } from '@/lib/utils'

function PanelSkeleton() {
  return (
    <div className="flex h-full flex-col bg-ui-bg" aria-busy="true">
      <div className="flex items-center gap-2.5 border-b border-ui-line bg-ui-surface px-4 py-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="space-y-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    </div>
  )
}

// CopilotKit is far too heavy for the shared bundle.
const DashboardAssistant = dynamic(() => import('@/components/admin/ai-dashboard/DashboardAssistant'), {
  ssr: false,
  loading: () => <PanelSkeleton />,
})

const fingerprintOf = (title: string, charts: AiChartSpec[]) => JSON.stringify({ title: title.trim(), charts })

export default function AdminAiDashboard() {
  const queryClient = useQueryClient()
  const [charts, setCharts] = useState<ChartInstance[]>([])
  const [title, setTitle] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const nextId = useRef(1)
  const chartsRef = useRef(charts)
  useEffect(() => {
    chartsRef.current = charts
  })

  const catalog = useQuery({
    queryKey: aiDashboardKeys.catalog,
    queryFn: fetchAiCatalog,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const dashboards = useQuery({ queryKey: aiDashboardKeys.dashboards, queryFn: listAiDashboards })

  // ── Frontend tool handlers ─────────────────────────────────────────────────

  const handleAddChart = useCallback(
    async (spec: AiChartSpec): Promise<string> => {
      setBanner(null)
      setPending((n) => n + 1)
      try {
        // Run it first: a statement the guard rejects must never reach the
        // board, and the agent needs the reason to correct itself.
        const result = await runAiSql(spec.sql)
        // Seed the cache the card is about to read, so it paints at once.
        queryClient.setQueryData(aiDashboardKeys.query(specCacheKey(spec)), result)
        const id = `chart-${nextId.current++}`
        setCharts((current) => [...current, { id, spec }])
        // Deliberately no rows, no totals, no sample values.
        return (
          `Added ${id} ("${spec.title ?? spec.chartType}") to the dashboard. It returned ${result.rowCount} row(s). ` +
          'The data itself stays with the admin and is not shared with you.'
        )
      } catch (error) {
        const message = sqlErrorMessage(error)
        setBanner(message)
        return `The chart was rejected: ${message}`
      } finally {
        setPending((n) => n - 1)
      }
    },
    [queryClient],
  )

  const handleRemoveChart = useCallback((id: string): boolean => {
    const found = chartsRef.current.some((chart) => chart.id === id)
    if (found) setCharts((current) => current.filter((chart) => chart.id !== id))
    return found
  }, [])

  // ── Saved dashboards ───────────────────────────────────────────────────────

  const resetBoard = useCallback(() => {
    setActiveId(null)
    setTitle('')
    setCharts([])
    setSaved(null)
    setBanner(null)
  }, [])

  const loadDashboard = useCallback(
    (record: AiDashboard) => {
      const drawable = (record.charts ?? []).filter(isAiChartSpec)
      setActiveId(String(record.id))
      setTitle(record.title)
      setCharts(drawable.map((spec) => ({ id: `chart-${nextId.current++}`, spec })))
      setSaved(fingerprintOf(record.title, drawable))
      setBanner(
        drawable.length < (record.charts ?? []).length
          ? 'Some charts on this dashboard could not be restored. Ask Hana to rebuild them.'
          : null,
      )
    },
    [],
  )

  const saveMutation = useMutation({
    mutationFn: async (input: { title: string; charts: AiChartSpec[] }) =>
      activeId ? updateAiDashboard(activeId, input) : createAiDashboard(input),
    onSuccess: (record, input) => {
      setActiveId(String(record.id))
      setSaved(fingerprintOf(input.title, input.charts))
      setBanner(null)
      void queryClient.invalidateQueries({ queryKey: aiDashboardKeys.dashboards })
    },
    onError: (error) => setBanner(sqlErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteAiDashboard(id),
    onSuccess: () => {
      setConfirmDelete(false)
      resetBoard()
      void queryClient.invalidateQueries({ queryKey: aiDashboardKeys.dashboards })
    },
    onError: (error) => {
      setConfirmDelete(false)
      setBanner(sqlErrorMessage(error))
    },
  })

  const specs = charts.map((chart) => chart.spec)
  const fingerprint = fingerprintOf(title, specs)
  const dirty = fingerprint !== saved
  const canSave = title.trim().length > 0 && dirty && !saveMutation.isPending
  const save = saveMutation.mutate

  // Once a dashboard exists its charts persist themselves: there is no button
  // to forget after Hana adds or removes one. Keyed on the specs, debounced so
  // a burst of additions collapses into one write.
  const chartsFingerprint = JSON.stringify(specs)
  const lastAutosaved = useRef<string | null>(null)
  useEffect(() => {
    lastAutosaved.current = null
  }, [activeId])
  useEffect(() => {
    if (!activeId || !title.trim()) return
    if (lastAutosaved.current === null) {
      lastAutosaved.current = chartsFingerprint
      return
    }
    if (lastAutosaved.current === chartsFingerprint || saveMutation.isPending) return
    const timer = setTimeout(() => {
      lastAutosaved.current = chartsFingerprint
      save({ title: title.trim(), charts: JSON.parse(chartsFingerprint) as AiChartSpec[] })
    }, 700)
    return () => clearTimeout(timer)
    // The title is read at save time; renaming goes through the Save button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, chartsFingerprint, saveMutation.isPending, save])

  const kpis = charts.filter((chart) => chart.spec.chartType === 'kpi')
  const graphs = charts.filter((chart) => chart.spec.chartType !== 'kpi')
  const list = dashboards.data ?? []

  return (
    <AdminLayout fullBleed>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="admin-ai @container min-w-0 flex-1 px-4 py-6 sm:px-6 lg:overflow-y-auto lg:px-8 lg:py-8">
          <PageHeader
            title="AI Dashboard"
            subtitle="Describe the charts you want and Hana builds them from Hadafi's live data. Save the board to share it with other admins."
            className="mb-5"
          />

          <div className="mb-5 flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface p-4 @4xl:flex-row @4xl:items-end">
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 @lg:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="ai-dashboard-title" className="text-sm font-medium text-ui-text">
                  Dashboard name
                </label>
                <input
                  id="ai-dashboard-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Board pack: learner growth"
                  maxLength={140}
                  className={inputClass}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="ai-dashboard-picker" className="text-sm font-medium text-ui-text">
                  Saved dashboards
                </label>
                <Select
                  id="ai-dashboard-picker"
                  className="h-10 w-full"
                  value={activeId ?? ''}
                  disabled={dashboards.isPending || list.length === 0}
                  onChange={(e) => {
                    const record = list.find((d) => String(d.id) === e.target.value)
                    if (record) loadDashboard(record)
                  }}
                >
                  <option value="" disabled>
                    {dashboards.isPending ? 'Loading…' : list.length === 0 ? 'None saved yet' : 'Open a dashboard'}
                  </option>
                  {list.map((d) => (
                    <option key={String(d.id)} value={String(d.id)}>
                      {d.title}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => save({ title: title.trim(), charts: specs })}
                disabled={!canSave}
                className={btn({ variant: 'primary', size: 'md' })}
                title={title.trim() ? undefined : 'Name the dashboard to save it'}
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                {saveMutation.isPending ? 'Saving…' : activeId && !dirty ? 'Saved' : 'Save'}
              </button>
              <button type="button" onClick={resetBoard} className={btn({ variant: 'secondary', size: 'md' })}>
                <Plus className="h-4 w-4" aria-hidden />
                New
              </button>
              {activeId && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete dashboard"
                  title="Delete dashboard"
                  className={cn(btn({ variant: 'secondary', size: 'icon' }), 'text-ui-danger')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </div>

          {banner && (
            <p role="alert" className="mb-4 whitespace-pre-line rounded-[10px] bg-ui-danger-soft px-3.5 py-2.5 text-[13px] text-ui-danger">
              {banner}
            </p>
          )}
          {dashboards.error && (
            <p role="alert" className="mb-4 rounded-[10px] bg-ui-danger-soft px-3.5 py-2.5 text-[13px] text-ui-danger">
              Saved dashboards could not be loaded.
            </p>
          )}

          <div className="mb-3 flex items-center gap-2 text-[13px] text-ui-muted">
            <span>
              {charts.length} chart{charts.length === 1 ? '' : 's'}
            </span>
            {pending > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Building a chart…
              </span>
            )}
          </div>

          {charts.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-ui-line bg-ui-surface">
              <EmptyState
                icon={Sparkles}
                title="No charts yet"
                body="Ask Hana something like “Add a chart of new learners per month” to get started."
              />
            </div>
          ) : (
            <div className="space-y-4">
              {kpis.length > 0 && (
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @md:grid-cols-2 @4xl:grid-cols-4">
                  {kpis.map((chart) => (
                    <AiChartCard key={chart.id} spec={chart.spec} onRemove={() => handleRemoveChart(chart.id)} />
                  ))}
                </div>
              )}
              {graphs.length > 0 && (
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @5xl:grid-cols-2">
                  {graphs.map((chart) => (
                    <AiChartCard key={chart.id} spec={chart.spec} onRemove={() => handleRemoveChart(chart.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside
          aria-label="Hana, dashboard assistant"
          className="flex h-[640px] shrink-0 flex-col border-t border-ui-line lg:h-auto lg:w-[400px] lg:border-l lg:border-t-0 xl:w-[440px]"
        >
          {catalog.isPending ? (
            <PanelSkeleton />
          ) : catalog.error ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                title={isAiNotSetUp(catalog.error) ? 'AI Dashboard isn’t set up for this environment yet' : 'Hana can’t build charts right now'}
                body={
                  isAiNotSetUp(catalog.error)
                    ? 'Hana builds charts once the read-only reporting connection is in place.'
                    : `The data catalogue could not be loaded: ${sqlErrorMessage(catalog.error)}. Saved dashboards still open.`
                }
                action={
                  <button type="button" onClick={() => void catalog.refetch()} className={btn({ variant: 'secondary', size: 'sm' })}>
                    Try again
                  </button>
                }
              />
            </div>
          ) : (
            <DashboardAssistant
              catalog={catalog.data}
              charts={charts}
              onAddChart={handleAddChart}
              onRemoveChart={handleRemoveChart}
              fallback={<PanelSkeleton />}
            />
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this dashboard?"
        message="Dashboards are shared across all admins, so deleting removes it for everyone."
        onConfirm={() => activeId && deleteMutation.mutate(activeId)}
        onCancel={() => setConfirmDelete(false)}
      />
    </AdminLayout>
  )
}
