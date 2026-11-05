'use client'

/**
 * AI Insights: ask Hana about Hadafi's data in plain language. She writes
 * read-only SQL against the reporting views (the server guards and runs it),
 * answers with numbered figures, and assembles PDF/Excel reports.
 */
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { btn, EmptyState, Skeleton } from '@/components/kit'
import { aiDashboardKeys, fetchAiCatalog, isAiNotSetUp, sqlErrorMessage } from '@/lib/api/adminAi'

/** The welcome screen's own shape, so nothing moves when the chat arrives. */
function ChatSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ui-bg" aria-busy="true">
      <div className="flex items-center gap-3 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[776px] flex-1 px-4 py-9 sm:px-8">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
        <div className="mt-6 space-y-px overflow-hidden rounded-[14px] border border-ui-line">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 bg-ui-surface px-4 py-3">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// CopilotKit's chat renderer is far heavier than any other admin screen
// needs, so it stays off every bundle but this one.
const InsightsChat = dynamic(() => import('@/components/admin/ai-insights/insights-chat'), {
  ssr: false,
  loading: () => <ChatSkeleton />,
})

export default function AdminAiInsights() {
  const catalog = useQuery({
    queryKey: aiDashboardKeys.catalog,
    queryFn: fetchAiCatalog,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  return (
    <AdminLayout fullBleed>
      {catalog.isPending ? (
        <ChatSkeleton />
      ) : catalog.error ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={AlertTriangle}
            title={
              isAiNotSetUp(catalog.error)
                ? 'AI Insights isn’t set up for this environment yet'
                : 'AI Insights could not be loaded'
            }
            body={
              isAiNotSetUp(catalog.error)
                ? 'It switches on once the read-only reporting connection is in place. Everything else on the platform works as usual.'
                : sqlErrorMessage(catalog.error)
            }
            action={
              <button type="button" onClick={() => void catalog.refetch()} className={btn({ variant: 'secondary', size: 'sm' })}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Try again
              </button>
            }
          />
        </div>
      ) : (
        <InsightsChat catalog={catalog.data} fallback={<ChatSkeleton />} />
      )}
    </AdminLayout>
  )
}
