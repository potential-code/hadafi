/**
 * Redesign UI kit: the building blocks every redesigned screen uses.
 * Visual source of truth: the approved canvas (Geist, one magenta accent,
 * buttons/inputs radius 10px, cards 14px, pills full). Colours always come
 * from the `ui-*` tokens in globals.css so light and dark both work.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { courseCoverSrc, optimizedSrc } from '@/lib/images'

// ── Buttons (class helper so it works on <button>, <Link> and <a>) ───────────

export const btn = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border font-semibold transition-[background-color,border-color,color,transform] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-ui-brand text-white hover:bg-ui-brand-hover',
        secondary: 'border-ui-line bg-ui-surface text-ui-text hover:bg-ui-surface-2',
        ghost: 'border-transparent bg-transparent text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text',
        danger: 'border-transparent bg-ui-danger text-white hover:opacity-90',
        soft: 'border-transparent bg-ui-brand-soft text-ui-brand-text hover:brightness-95',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)
export type BtnProps = VariantProps<typeof btn>

export const Button = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'> & BtnProps>(
  function Button({ className, variant, size, type = 'button', ...props }, ref) {
    return <button ref={ref} type={type} className={cn(btn({ variant, size }), className)} {...props} />
  },
)

// ── Layout ────────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ui-text sm:text-[28px] sm:leading-tight">{title}</h1>
        {subtitle && <p className="max-w-[70ch] text-[15px] text-ui-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionHeader({
  title,
  action,
  as: Tag = 'h2',
  className,
  id,
}: {
  title: ReactNode
  action?: ReactNode
  as?: 'h2' | 'h3'
  className?: string
  id?: string
}) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <Tag id={id} className="text-base font-semibold text-ui-text sm:text-lg">{title}</Tag>
      {action && <div className="text-[13px] font-semibold">{action}</div>}
    </div>
  )
}

export const Card = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'> & { interactive?: boolean }>(
  function Card({ className, interactive, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-[14px] border border-ui-line bg-ui-surface',
          interactive && 'transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-ui',
          className,
        )}
        {...props}
      />
    )
  },
)

/** Card section header row with a bottom rule (tables, lists). */
export function CardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-ui-line px-5 py-4', className)}>
      <h2 className="text-base font-semibold text-ui-text">{title}</h2>
      {action && <div className="text-[13px] font-semibold">{action}</div>}
    </div>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────────

const chip = cva('inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-ui-surface-2 text-ui-muted',
      brand: 'bg-ui-brand-soft text-ui-brand-text',
      ok: 'bg-ui-ok-soft text-ui-ok',
      danger: 'bg-ui-danger-soft text-ui-danger',
      solid: 'bg-ui-brand text-white',
    },
  },
  defaultVariants: { tone: 'neutral' },
})
export function Chip({ tone, className, ...props }: ComponentPropsWithoutRef<'span'> & VariantProps<typeof chip>) {
  return <span className={cn(chip({ tone }), className)} {...props} />
}

export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 overflow-hidden rounded-full bg-ui-surface-2', className)}
    >
      <div className="h-full rounded-full bg-ui-brand transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  )
}

/** Pill filter buttons. `active` is the selected value. */
export function FilterChips<T extends string>({
  options,
  active,
  onChange,
  label,
  className,
}: {
  /** Values are plain strings so loosely typed option lists work; `active` fixes T. */
  options: ReadonlyArray<{ value: string; label: ReactNode; count?: number }>
  active: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('-mx-1 flex gap-2 overflow-x-auto px-1 pb-1', className)}>
      {options.map((o) => {
        const on = o.value === active
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value as T)}
            className={cn(
              'inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors',
              on ? 'border-ui-text bg-ui-text text-ui-bg' : 'border-ui-line bg-ui-surface text-ui-text hover:bg-ui-surface-2',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cn('text-xs', on ? 'opacity-70' : 'text-ui-muted')}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Underlined tabs for switching views inside a page. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  className,
}: {
  tabs: ReadonlyArray<{ value: string; label: ReactNode; count?: number }>
  active: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-5 overflow-x-auto border-b border-ui-line', className)}>
      {tabs.map((t) => {
        const on = t.value === active
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value as T)}
            className={cn(
              '-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-1 text-sm transition-colors',
              on ? 'border-ui-brand font-semibold text-ui-text' : 'border-transparent font-medium text-ui-muted hover:text-ui-text',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-ui-surface-2 px-1.5 text-xs text-ui-muted">{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      {Icon && (
        <span className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ui-surface-2 text-ui-muted">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      )}
      <p className="text-[15px] font-semibold text-ui-text">{title}</p>
      {body && <p className="max-w-[46ch] text-sm leading-relaxed text-ui-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function StatCard({
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
    <Card className={cn('flex flex-col gap-1 p-5', className)}>
      <span className="flex items-center gap-2 text-[13px] text-ui-muted">
        {Icon && <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
        {label}
      </span>
      <span className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ui-text tabular-nums">{value}</span>
      {hint && <span className="text-xs text-ui-muted">{hint}</span>}
    </Card>
  )
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

const AVATAR_TONES = [
  'bg-[#FBEEF4] text-[#9f2063]',
  'bg-[#E8EEF9] text-[#1d4e89]',
  'bg-[#E7F4EC] text-[#1a7149]',
  'bg-[#FDF1E3] text-[#8a4513]',
  'bg-[#EEE8F6] text-[#4c1d6e]',
  'bg-[#EDEFF2] text-[#2f4858]',
]
function hashIndex(s: string, n: number) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % n
}

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.32)) }
  if (src) {
    return <img src={optimizedSrc(src)} alt="" style={style} className={cn('shrink-0 rounded-full object-cover', className)} />
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', AVATAR_TONES[hashIndex(name, AVATAR_TONES.length)], className)}
    >
      {initialsOf(name)}
    </span>
  )
}

/**
 * Course cover: the course's image, or Hadafi's default cover when it has none.
 * `title` and `icon` are kept for callers; the default cover replaced the old coloured tile.
 */
export function CoverTile({
  src,
  className,
}: {
  src?: string | null
  title: string
  icon?: LucideIcon
  className?: string
}) {
  return <img src={courseCoverSrc(src)} alt="" className={cn('aspect-video w-full object-cover', className)} />
}

// ── Forms ─────────────────────────────────────────────────────────────────────

export const inputClass =
  'h-10 w-full rounded-[10px] border border-ui-line bg-ui-surface px-3 text-sm text-ui-text placeholder:text-ui-muted transition-colors focus:border-ui-brand focus:outline-none focus:ring-2 focus:ring-ui-brand/20 disabled:opacity-60'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  htmlFor: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ui-text">{label}</label>
      {children}
      {error ? (
        <p className="text-[13px] text-ui-danger" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-ui-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/** Table styling inside a Card: `<table className={tableClass}>`. */
export const tableClass =
  'w-full border-collapse text-sm [&_th]:px-5 [&_th]:py-3 [&_th]:text-left [&_th]:text-[13px] [&_th]:font-semibold [&_th]:text-ui-muted [&_td]:px-5 [&_td]:py-3.5 [&_td]:align-middle [&_tbody_tr]:border-t [&_tbody_tr]:border-ui-line [&_tbody_tr:hover]:bg-ui-bg'

/** Loading placeholder block matching the final layout's shape. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-[10px] bg-ui-surface-2', className)} />
}
