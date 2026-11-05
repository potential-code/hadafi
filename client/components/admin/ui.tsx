'use client'

/**
 * Admin console building blocks (redesign). Dense, Linear/Notion-style pieces
 * that sit on top of the shared kit (`@/components/kit`). Colours always come
 * from the `ui-*` tokens so light and dark both work.
 */
import { useEffect, useId, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cva, type VariantProps } from 'class-variance-authority'
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Section heading inside a card ─────────────────────────────────────────────

export function PanelHeader({
  title,
  subtitle,
  action,
  id,
  className,
  border = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  id?: string
  className?: string
  border?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 py-3.5', border && 'border-b border-ui-line', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-ui-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ui-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">{action}</div>}
    </div>
  )
}

// ── Compact stat ──────────────────────────────────────────────────────────────

export function AdminStat({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-[14px] border border-ui-line bg-ui-surface px-[18px] py-4', className)}>
      <span className="flex items-center gap-2 text-[13px] font-medium text-ui-muted">
        {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />}
        {label}
      </span>
      <span className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-ui-text tabular-nums">{value}</span>
      {hint && <span className="text-xs text-ui-muted">{hint}</span>}
    </div>
  )
}

// ── Pills and tags ────────────────────────────────────────────────────────────

const pill = cva('inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-ui-surface-2 text-ui-muted',
      brand: 'bg-ui-brand-soft text-ui-brand-text',
      ok: 'bg-ui-ok-soft text-ui-ok',
      danger: 'bg-ui-danger-soft text-ui-danger',
      line: 'border border-ui-line bg-transparent text-ui-muted',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Pill({
  tone,
  dot,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'span'> & VariantProps<typeof pill> & { dot?: boolean }) {
  return (
    <span className={cn(pill({ tone }), className)} {...props}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function Tag({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      className={cn('inline-flex h-[22px] items-center whitespace-nowrap rounded-md bg-ui-surface-2 px-2 text-xs font-medium text-ui-muted', className)}
      {...props}
    />
  )
}

// ── Toolbar inputs ────────────────────────────────────────────────────────────

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Accessible name; defaults to the placeholder. */
  label?: string
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex h-9 min-w-0 items-center gap-2 rounded-[10px] border border-ui-line bg-ui-surface px-2.5 focus-within:border-ui-brand focus-within:ring-2 focus-within:ring-ui-brand/20',
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-ui-muted" strokeWidth={1.75} aria-hidden />
      <span className="sr-only">{label ?? placeholder}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ui-text outline-none placeholder:text-ui-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-ui-muted hover:text-ui-text"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </label>
  )
}

/** Native select styled for toolbars (36px) and forms (`size="md"`, 40px). */
export const selectClass =
  'h-9 appearance-none rounded-[10px] border border-ui-line bg-ui-surface bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat pl-2.5 pr-8 text-[13px] font-medium text-ui-text focus:border-ui-brand focus:outline-none focus:ring-2 focus:ring-ui-brand/20 disabled:opacity-60 bg-[image:url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238a8a96%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E)]'

export function Select({ className, ...props }: ComponentPropsWithoutRef<'select'>) {
  return <select className={cn(selectClass, className)} {...props} />
}

/** Segmented control (two to four options). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode; icon?: LucideIcon }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-0.5 rounded-[10px] border border-ui-line bg-ui-surface-2 p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[13px] font-semibold transition-colors',
              on ? 'bg-ui-surface text-ui-text shadow-[0_1px_2px_rgba(23,23,28,0.08)]' : 'text-ui-muted hover:text-ui-text',
            )}
          >
            {Icon && <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Tables ────────────────────────────────────────────────────────────────────

/** Dense table: grey header band, 9px rows, 20px outer padding. */
export const adminTableClass =
  'w-full border-collapse text-sm [&_th]:h-[38px] [&_th]:whitespace-nowrap [&_th]:bg-ui-surface-2 [&_th]:px-3.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-ui-muted [&_th:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td]:border-t [&_td]:border-ui-line [&_td]:px-3.5 [&_td]:py-[9px] [&_td]:align-middle [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_tbody_tr:hover]:bg-ui-bg'

/** Card that holds a table; scrolls horizontally inside itself on phones. */
export function TableCard({
  children,
  footer,
  header,
  className,
}: {
  children: ReactNode
  footer?: ReactNode
  header?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface', className)}>
      {header}
      {/* `relative` keeps absolutely placed bits (screen-reader text) inside the scroll box, so a wide
          table never widens the page; tabIndex lets keyboard users scroll it. */}
      <div
        tabIndex={0}
        className="relative overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-brand"
      >
        {children}
      </div>
      {footer && <div className="border-t border-ui-line px-5 py-3 text-[13px] text-ui-muted">{footer}</div>}
    </div>
  )
}

export type SortDir = 'asc' | 'desc'

/** Sortable column header button. Put inside a `<th aria-sort=...>`. */
export function SortButton({
  children,
  active,
  dir,
  onClick,
}: {
  children: ReactNode
  active: boolean
  dir: SortDir
  onClick: () => void
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex items-center gap-1 font-semibold', active ? 'text-ui-text' : 'text-ui-muted hover:text-ui-text')}
    >
      {children}
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
    </button>
  )
}

/** Small square icon button (32px). Always pass `label`. */
export function IconButton({
  label,
  icon: Icon,
  tone = 'default',
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<'button'>, 'children'> & { label: string; icon: LucideIcon; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-ui-surface-2 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
        tone === 'danger' ? 'hover:text-ui-danger' : 'hover:text-ui-text',
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </button>
  )
}

/** On/off switch (32x18). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
        checked ? 'bg-ui-brand' : 'bg-ui-line',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left]', checked ? 'left-4' : 'left-0.5')}
      />
    </button>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * Accessible modal shell: portal, Escape to close, focus moved in and restored,
 * scrolls inside on small screens. `footer` is pinned under the body.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('input:not([type=hidden]),textarea,select,button[data-autofocus]')
      ;(el ?? panelRef.current)?.focus()
    }, 0)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[14px] border border-ui-line bg-ui-surface text-ui-text shadow-ui outline-none sm:max-h-[88dvh] sm:rounded-[14px]',
          width,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-ui-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ui-text">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ui-muted">{description}</p>}
          </div>
          <IconButton label="Close" icon={X} onClick={onClose} className="-mr-1.5 -mt-1" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-ui-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

// ── Charts (CSS, token coloured) ──────────────────────────────────────────────

function niceMax(n: number) {
  if (n <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(n)))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const m = step * pow
    if (m >= n) return m
  }
  return 10 * pow
}

/** Column chart for a short series (e.g. 12 months). Labels each non-zero bar. */
export function ColumnChart({
  data,
  label,
  height = 170,
  className,
}: {
  data: { label: string; value: number }[]
  /** Accessible description of the chart. */
  label: string
  height?: number
  className?: string
}) {
  // At least 2, so the middle tick of a count is a whole number.
  const max = niceMax(Math.max(2, ...data.map((d) => d.value)))
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))` }
  // Long series show every 2nd or 3rd label (counted back from the latest) so dates never run together;
  // phones show half as many again.
  const every = data.length > 16 ? 3 : data.length > 8 ? 2 : 1
  const shown = (i: number, step: number) => (data.length - 1 - i) % step === 0
  const ticks = [0, max / 2, max]
  return (
    <div role="img" aria-label={label} className={cn('grid grid-cols-[28px_minmax(0,1fr)] gap-2 pt-[18px]', className)}>
      <div className="relative text-[11px] tabular-nums text-ui-muted" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${100 - (t / max) * 100}%` }}>
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </span>
        ))}
      </div>
      <div className="relative grid items-end gap-1.5 border-b border-ui-line" style={{ height, ...cols }}>
        <span className="absolute inset-x-0 border-t border-dashed border-ui-line" style={{ bottom: '50%' }} />
        <span className="absolute inset-x-0 border-t border-dashed border-ui-line" style={{ bottom: '100%' }} />
        {data.map((d, i) => {
          const h = (d.value / max) * 100
          return (
            <div key={`${d.label}-${i}`} className="relative flex h-full justify-center" title={`${d.label}: ${d.value}`}>
              {d.value > 0 && (
                <>
                  <div className="absolute bottom-0 w-[70%] max-w-7 rounded-t bg-ui-brand" style={{ height: `${h}%` }} />
                  <span
                    className="absolute inset-x-0 text-center text-[11px] font-semibold leading-none text-ui-text tabular-nums"
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
      <div className="col-start-2 grid gap-1.5 text-center text-[11px] text-ui-muted" style={cols}>
        {data.map((d, i) => (
          <span
            key={`${d.label}-${i}`}
            className={cn('flex justify-center', !shown(i, every) && 'invisible', !shown(i, every * 2) && 'max-sm:invisible')}
          >
            <span className="whitespace-nowrap">{d.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Horizontal bar list: label, track, value. */
export function BarList({
  data,
  format = (v) => String(v),
  max,
  className,
}: {
  data: { label: string; value: number }[]
  format?: (v: number) => string
  /** Scale maximum; defaults to the largest value (or 100 for percentages). */
  max?: number
  className?: string
}) {
  const top = max ?? niceMax(Math.max(2, ...data.map((d) => d.value)))
  return (
    <div className={cn('grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_40px] items-center gap-x-3 gap-y-2.5 text-[13px] sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)_44px]', className)}>
      {data.map((d, i) => (
        <BarRow key={`${d.label}-${i}`} label={d.label} value={d.value} pct={top > 0 ? (d.value / top) * 100 : 0} text={format(d.value)} />
      ))}
    </div>
  )
}

function BarRow({ label, value, pct, text }: { label: string; value: number; pct: number; text: string }) {
  return (
    <>
      <span className="truncate text-ui-text" title={label}>{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-ui-surface-2">
        <span className="block h-full rounded-full bg-ui-brand" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className={cn('text-right tabular-nums', value > 0 ? 'font-semibold text-ui-text' : 'font-medium text-ui-muted')}>{text}</span>
    </>
  )
}

/** Recharts colours read from the CSS tokens (SVG attributes accept var()). */
export const chartColors = {
  brand: 'var(--ui-brand)',
  text: 'var(--ui-text)',
  muted: 'var(--ui-muted)',
  line: 'var(--ui-line)',
  surface: 'var(--ui-surface)',
  surface2: 'var(--ui-surface-2)',
  /** Categorical series, brand first. */
  series: ['var(--ui-brand)', '#1d4e89', '#1f6f5c', '#8a4513', '#4c1d6e', '#2f4858', '#7a1a4c'],
}

export const chartTooltipStyle = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid var(--ui-line)',
    background: 'var(--ui-surface)',
    color: 'var(--ui-text)',
    fontSize: 12,
    boxShadow: 'var(--ui-shadow)',
  },
  labelStyle: { color: 'var(--ui-text)', fontWeight: 600 },
  itemStyle: { color: 'var(--ui-text)' },
  cursor: { fill: 'var(--ui-surface-2)' },
}

/** Short "1 Oct 2026" date. */
export function fmtDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  if (opts) return d.toLocaleDateString('en-GB', opts)
  // Built by hand: some ICU versions print "Sept" for en-GB.
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  return `${d.getDate()} ${m} ${d.getFullYear()}`
}
