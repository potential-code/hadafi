'use client'

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type Validator = (v: string) => string | null

/** 44px auth input with a leading icon (label above, help or error below). */
export const authInputClass =
  'h-11 w-full rounded-[10px] border border-ui-line bg-ui-surface text-[15px] text-ui-text placeholder:text-ui-muted transition-[border-color,box-shadow] focus:border-ui-brand focus:outline-none focus:ring-[3px] focus:ring-ui-brand-soft disabled:opacity-60'

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  label: ReactNode
  /** Rendered on the label row, right-aligned (e.g. "Forgot password?"). */
  labelAside?: ReactNode
  icon?: ReactNode
  trailing?: ReactNode
  value: string
  /** Runs after the field is first blurred, like the old floating field. */
  validator?: Validator
  externalError?: ReactNode | null
  help?: ReactNode
}

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, labelAside, icon, trailing, value, validator, externalError, help, className, onBlur, id: idProp, ...rest },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  const [touched, setTouched] = useState(false)
  const internal = touched && validator ? validator(value) : null
  const error = externalError ?? internal
  const describedBy = error ? `${id}-err` : help ? `${id}-help` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-ui-text">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative flex items-center">
        {icon && (
          <span aria-hidden className="pointer-events-none absolute left-3 text-ui-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">
            {icon}
          </span>
        )}
        <input
          id={id}
          ref={ref}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onBlur={(e) => {
            setTouched(true)
            onBlur?.(e)
          }}
          className={cn(
            authInputClass,
            icon ? 'pl-10' : 'pl-3',
            trailing ? 'pr-11' : 'pr-3',
            error && 'border-ui-danger focus:border-ui-danger',
            className,
          )}
          {...rest}
        />
        {trailing && <span className="absolute right-1 flex items-center">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${id}-err`} className="flex items-start gap-1.5 text-xs text-ui-danger">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-xs text-ui-muted">
          {help}
        </p>
      ) : null}
    </div>
  )
})

/** Eye toggle for password fields. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text"
    >
      {shown ? <EyeOff className="h-[18px] w-[18px]" aria-hidden /> : <Eye className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  )
}

/** Red inline alert used for form-level errors. */
export function AuthAlert({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-2.5 rounded-[10px] border border-ui-danger/30 bg-ui-danger-soft px-3 py-2.5 text-[13px] leading-[1.45] text-ui-danger"
    >
      <AlertCircle className="mt-px h-[18px] w-[18px] shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

/** Neutral notice (e.g. session expired). */
export function AuthNote({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-[10px] bg-ui-surface-2 px-3 py-2.5 text-[13px] leading-[1.45] text-ui-text">
      {icon && <span className="mt-px shrink-0 text-ui-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
      <span>{children}</span>
    </div>
  )
}

/** Thin "or" divider between the primary action and the alternative. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[13px] text-ui-muted">
      <span className="h-px flex-1 bg-ui-line" />
      or
      <span className="h-px flex-1 bg-ui-line" />
    </div>
  )
}
