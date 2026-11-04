'use client'

/**
 * Who booked an event, who came, and its Zoom meeting (for Zoom events):
 * meeting ID and passcode, a host link fetched fresh from Zoom, and re-sync.
 * Port of SMEEP e1cec80.
 * Sits beside the events table like the edit panel.
 */
import { useEffect, useRef, useState } from 'react'
import { revealIfStacked } from '@/components/admin/content/useMediaQuery'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Download, ExternalLink, Loader2, RefreshCw, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { btn, EmptyState, Skeleton } from '@/components/kit'
import { IconButton, Pill } from '@/components/admin/ui'
import { errorMessage as eventErrorMessage } from '@/lib/api/errors'
import {
  apiResyncZoom,
  fetchEventBookings,
  fetchHostStartUrl,
  type AdminLiveEvent,
} from '@/lib/api/liveEvents'
import { cn } from '@/lib/utils'

const ZOOM_STATUS: Record<AdminLiveEvent['zoom']['status'], { label: string; tone: 'ok' | 'neutral' | 'danger' | 'brand' }> = {
  active: { label: 'Meeting ready', tone: 'ok' },
  pending: { label: 'Setting up', tone: 'neutral' },
  failed: { label: 'Needs attention', tone: 'danger' },
  not_required: { label: 'Not Zoom', tone: 'neutral' },
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-center justify-between gap-2 rounded-[10px] bg-ui-surface-2 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-ui-muted">{label}</span>
        <span className="block truncate font-mono text-sm text-ui-text">{value}</span>
      </span>
      <IconButton
        label={done ? 'Copied' : `Copy ${label.toLowerCase()}`}
        icon={done ? Check : Copy}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setDone(true)
            window.setTimeout(() => setDone(false), 1500)
          } catch {
            toast.error('Copy didn’t work')
          }
        }}
      />
    </div>
  )
}

async function downloadBookings(event: AdminLiveEvent, format: 'csv' | 'xlsx') {
  const res = await fetch(`/api/live-events/${event.id}/bookings/export?format=${format}`, { credentials: 'same-origin' })
  if (!res.ok) throw new Error('export failed')
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `bookings.${format}`
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function EventBookingsPanel({
  event,
  onClose,
  onUpdated,
  className,
}: {
  event: AdminLiveEvent
  onClose: () => void
  onUpdated: (e: AdminLiveEvent) => void
  className?: string
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'event-bookings', event.id], queryFn: () => fetchEventBookings(event.id) })
  const [opening, setOpening] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  // Bring the panel into view when it stacks under the table (narrow screens).
  useEffect(() => {
    const t = window.setTimeout(() => revealIfStacked(panelRef.current), 0)
    return () => window.clearTimeout(t)
  }, [event.id])
  const resync = useMutation({
    mutationFn: () => apiResyncZoom(event.id),
    onSuccess: (e) => {
      onUpdated(e)
      void qc.invalidateQueries({ queryKey: ['admin', 'event-bookings', event.id] })
      toast[e.zoom.status === 'active' ? 'success' : 'error'](e.zoom.status === 'active' ? 'Zoom is in sync' : (e.zoom.error ?? 'Zoom still isn’t in sync'))
    },
    onError: (e) => toast.error(eventErrorMessage(e, 'Re-sync didn’t work. Try again.')),
  })

  async function startAsHost() {
    // Open the tab first (popup blockers), then point it at the fresh link.
    const tab = window.open('about:blank', '_blank')
    setOpening(true)
    try {
      const { url } = await fetchHostStartUrl(event.id)
      if (tab) tab.location.href = url
      else window.location.assign(url)
    } catch (e) {
      tab?.close()
      toast.error(eventErrorMessage(e, 'Couldn’t get the host link from Zoom.'))
    } finally {
      setOpening(false)
    }
  }

  const zoomStatus = ZOOM_STATUS[event.zoom.status]
  const read = !!event.zoom.attendanceSyncedAt
  const [openedAt] = useState(() => Date.now())
  const ended = Date.parse(event.endsAt) < openedAt

  return (
    <aside ref={panelRef} aria-labelledby={`bk-${event.id}`} className={cn('flex scroll-mt-20 flex-col rounded-[14px] border border-ui-line bg-ui-surface', className)}>
      <div className="flex items-center gap-2.5 border-b border-ui-line px-[18px] py-3.5">
        <div className="min-w-0 flex-1">
          <h2 id={`bk-${event.id}`} className="truncate text-base font-semibold text-ui-text">
            {event.title}
          </h2>
          <p className="text-xs text-ui-muted">
            {event.capacity != null ? `${event.bookings} of ${event.capacity} places booked` : `${event.bookings} booked`}
            {read ? `, ${event.attended} attended` : ''}
          </p>
        </div>
        <IconButton label="Close" icon={X} onClick={onClose} className="-mr-1.5" />
      </div>

      {event.format === 'zoom' && (
        <section aria-label="Zoom meeting" className="flex flex-col gap-2.5 border-b border-ui-line px-[18px] py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ui-text">Zoom meeting</span>
            <Pill tone={zoomStatus.tone === 'danger' ? 'danger' : zoomStatus.tone === 'ok' ? 'ok' : 'line'}>{zoomStatus.label}</Pill>
          </div>
          {event.zoom.error && event.zoom.status !== 'active' && (
            <p role="alert" className="rounded-[10px] bg-ui-danger-soft px-3 py-2 text-[13px] text-ui-danger">
              {event.zoom.error}
            </p>
          )}
          {event.zoom.meetingId && <CopyValue label="Meeting ID" value={event.zoom.meetingId.replace(/(\d{3})(\d{4})(\d+)/, '$1 $2 $3')} />}
          {event.zoom.passcode && <CopyValue label="Passcode" value={event.zoom.passcode} />}
          <div className="flex flex-wrap gap-2">
            {event.zoom.meetingId && !ended && (
              <button type="button" className={btn({ size: 'sm' })} onClick={startAsHost} disabled={opening}>
                {opening ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ExternalLink className="h-4 w-4" aria-hidden />}
                Start as host
              </button>
            )}
            {!ended && (
              <button type="button" className={btn({ variant: 'secondary', size: 'sm' })} onClick={() => resync.mutate()} disabled={resync.isPending}>
                <RefreshCw className={cn('h-4 w-4', resync.isPending && 'animate-spin')} aria-hidden />
                Re-sync
              </button>
            )}
          </div>
          {event.zoom.meetingId && !ended && (
            <p className="text-xs leading-relaxed text-ui-muted">
              The host link gives full control of the meeting; it opens in a new tab and isn’t saved. Learners each get their own link when
              they book.
            </p>
          )}
          {ended && event.format === 'zoom' && (
            <p className="text-xs text-ui-muted">{read ? 'Attendance was read from Zoom’s report.' : 'Attendance appears here once Zoom’s report is ready (usually within an hour).'}</p>
          )}
        </section>
      )}

      <section aria-label="Bookings" className="flex flex-col">
        <div className="flex items-center justify-between gap-2 px-[18px] pb-2 pt-4">
          <span className="text-sm font-semibold text-ui-text">Bookings</span>
          {!!data?.bookings.length && (
            <span className="flex gap-1">
              {(['csv', 'xlsx'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={btn({ variant: 'ghost', size: 'sm' })}
                  onClick={() => downloadBookings(event, f).catch(() => toast.error('The download didn’t work'))}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {f === 'csv' ? 'CSV' : 'Excel'}
                </button>
              ))}
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-2 px-[18px] pb-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : !data?.bookings.length ? (
          <EmptyState icon={Users} title="No bookings yet" body={event.status === 'published' ? 'Learners book from the Events page.' : 'Publish the event so learners can book.'} />
        ) : (
          <ul className="flex max-h-[420px] flex-col overflow-y-auto px-[18px] pb-3">
            {data.bookings.map((b) => (
              <li key={b.userId} className="flex items-center gap-2 border-t border-ui-line py-2 first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ui-text">{b.fullName}</span>
                  <span className="block truncate text-xs text-ui-muted">{b.email}</span>
                </span>
                {b.attendedMinutes != null ? (
                  b.attendedMinutes > 0 ? <Pill tone="ok">{b.attendedMinutes} min</Pill> : <Pill tone="line">Didn’t join</Pill>
                ) : event.format === 'zoom' && b.zoomStatus !== 'active' && !ended ? (
                  <Pill tone="line" title="Zoom hasn’t issued this learner’s link yet">Link pending</Pill>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!!data?.guests.length && (
          <div className="border-t border-ui-line px-[18px] py-3">
            <p className="text-xs font-semibold text-ui-muted">Also in the meeting, without booking</p>
            <p className="mt-1 text-[13px] text-ui-text">{data.guests.map((g) => `${g.name} (${g.minutes} min)`).join(', ')}</p>
          </div>
        )}
      </section>
    </aside>
  )
}
