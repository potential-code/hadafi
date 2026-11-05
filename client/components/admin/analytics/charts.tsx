'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { countAxisMax } from './trend'

/**
 * Column chart for a time series (same look as `ColumnChart` in admin/ui.tsx)
 * that also copes with 30 daily buckets: axis labels thin out, value labels
 * only sit on non-zero bars, and each column carries its full date as a tooltip.
 */
export function TrendColumns({
  data,
  label,
  height = 200,
  className,
}: {
  data: { short: string; full: string; value: number }[]
  /** Accessible description of the chart. */
  label: string
  height?: number
  className?: string
}) {
  const max = countAxisMax(Math.max(0, ...data.map((d) => d.value)))
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))` }
  const ticks = [0, max / 2, max]
  // Desktop: every label up to 12 columns, then every 5th. Phones: half as many.
  const every = data.length <= 12 ? 1 : 5
  const dense = data.length > 16
  return (
    <div role="img" aria-label={label} className={cn('grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 gap-y-2 pt-[18px]', className)}>
      <div className="relative text-[11px] tabular-nums text-ui-muted" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${100 - (t / max) * 100}%` }}>
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </span>
        ))}
      </div>
      <div className={cn('relative grid items-end border-b border-ui-line', dense ? 'gap-0.5 sm:gap-1' : 'gap-1.5')} style={{ height, ...cols }}>
        <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-ui-line" style={{ bottom: '50%' }} />
        <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-ui-line" style={{ bottom: '100%' }} />
        {data.map((d, i) => {
          const h = (d.value / max) * 100
          return (
            <div key={`${d.full}-${i}`} className="relative flex h-full justify-center" title={`${d.full}: ${d.value}`}>
              {d.value > 0 && (
                <>
                  <div className="absolute bottom-0 w-[70%] max-w-7 rounded-t bg-ui-brand" style={{ height: `${h}%` }} />
                  <span
                    className="absolute inset-x-[-6px] text-center text-[11px] font-semibold leading-none text-ui-text tabular-nums"
                    style={{ bottom: `calc(${h}% + 5px)` }}
                  >
                    {d.value}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className={cn('col-start-2 grid text-center text-[11px] text-ui-muted', dense ? 'gap-0.5 sm:gap-1' : 'gap-1.5')} style={cols}>
        {data.map((d, i) => {
          const show = i % every === 0
          const showPhone = i % (every * 2) === 0
          return (
            <span
              key={`${d.full}-${i}`}
              className={cn(
                'flex justify-center overflow-visible whitespace-nowrap',
                !show && 'invisible',
                show && !showPhone && 'max-sm:invisible',
              )}
            >
              {d.short}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** One card holding a row of headline numbers separated by hairlines. */
export function KpiStrip({ items, loading }: { items: { label: string; value: ReactNode; hint: string }[]; loading?: boolean }) {
  return (
    <div className="@container overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
      {/* -m-px hides the outer edges of each cell's left/top hairline */}
      <dl className="-m-px grid grid-cols-2 @xl:grid-cols-4 @4xl:grid-cols-7">
        {items.map((k) => (
          <div key={k.label} className="flex min-w-0 flex-col gap-1.5 border-l border-t border-ui-line px-[18px] py-4">
            <dt className="text-[13px] font-medium text-ui-muted">{k.label}</dt>
            <dd className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-ui-text tabular-nums">
              {loading ? <span aria-hidden className="inline-block h-7 w-10 animate-pulse rounded-md bg-ui-surface-2 align-middle" /> : k.value}
            </dd>
            <dd className="text-xs text-ui-muted">{k.hint}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * Resolve CSS colour tokens (e.g. `var(--ui-brand)`) to concrete values for
 * SVG chart libraries, re-reading them when the theme class on <html> changes.
 * Values that aren't `var(--x)` pass through unchanged. Before mount (SSR) the
 * `var()` strings are returned as-is, which Chrome also accepts in SVG.
 */
export function useResolvedColors<T extends Record<string, string>>(tokens: T): T {
  const [resolved, setResolved] = useState<T>(tokens)
  const key = JSON.stringify(tokens)
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement)
      const out = {} as Record<string, string>
      for (const [k, v] of Object.entries(JSON.parse(key) as Record<string, string>)) {
        const m = /^var\((--[\w-]+)\)$/.exec(v.trim())
        out[k] = m ? cs.getPropertyValue(m[1]).trim() || v : v
      }
      setResolved(out as T)
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', read)
    return () => {
      mo.disconnect()
      mq.removeEventListener('change', read)
    }
  }, [key])
  return resolved
}
