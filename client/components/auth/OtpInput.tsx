'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { cn } from '@/lib/utils'

const LENGTH = 6

export interface OtpInputHandle {
  focus: () => void
}

/**
 * The 6-digit email code as six boxes. The value is the digits typed so far,
 * always contiguous: clicking a later box lands on the first empty one, and
 * Backspace removes the digit in the box (or, in an empty box, the one before).
 *
 * Pasting a code, or the phone's "From Mail" suggestion (autocomplete
 * one-time-code, which drops the whole code into one box), fills every box.
 * `onComplete` fires when the sixth digit arrives, so callers can submit.
 */
export const OtpInput = forwardRef<
  OtpInputHandle,
  {
    value: string
    onChange: (value: string) => void
    onComplete?: (value: string) => void
    id?: string
    disabled?: boolean
    invalid?: boolean
    size?: 'md' | 'sm'
    'aria-label'?: string
    'aria-labelledby'?: string
    'aria-describedby'?: string
  }
>(function OtpInput(
  { value, onChange, onComplete, id, disabled, invalid, size = 'md', ...aria },
  ref,
) {
  const boxes = useRef<Array<HTMLInputElement | null>>([])
  // The newest value, ahead of the re-render: focus moves inside the same
  // event, and the focus handler must see the digit just typed.
  const latest = useRef(value)
  latest.current = value
  const focusBox = (i: number) => {
    const el = boxes.current[Math.max(0, Math.min(LENGTH - 1, i))]
    el?.focus()
    el?.select()
  }
  useImperativeHandle(ref, () => ({ focus: () => focusBox(Math.min(value.length, LENGTH - 1)) }), [value.length])

  function commit(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH)
    const before = latest.current
    latest.current = clean
    onChange(clean)
    if (clean.length === LENGTH && clean !== before) onComplete?.(clean)
    return clean
  }

  function handleInput(i: number, raw: string) {
    const value = latest.current
    const current = value[i] ?? ''
    let digits = raw.replace(/\D/g, '')
    // The box held a digit and the caret sat beside it: keep only the new one.
    if (current && digits.length === 2) digits = digits.startsWith(current) ? digits.slice(1) : digits.slice(0, 1)
    if (!digits) return
    const next = commit(value.slice(0, i) + digits + value.slice(i + digits.length))
    focusBox(Math.min(i + digits.length, next.length))
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    const value = latest.current
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (value[i]) {
        commit(value.slice(0, i) + value.slice(i + 1))
        focusBox(i)
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i))
        focusBox(i - 1)
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusBox(i - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusBox(Math.min(i + 1, value.length))
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!digits) return
    e.preventDefault()
    const next = commit(digits)
    focusBox(Math.min(next.length, LENGTH - 1))
  }

  return (
    <div role="group" className={cn('flex', size === 'sm' ? 'gap-2' : 'gap-2.5 sm:gap-3')} {...aria}>
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el
          }}
          id={i === 0 ? id : undefined}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          value={value[i] ?? ''}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => {
            // Keep the digits contiguous: a click past the end lands on the first empty box.
            if (i > latest.current.length) focusBox(latest.current.length)
            else e.target.select()
          }}
          className={cn(
            'min-w-0 flex-1 rounded-[10px] border bg-ui-surface text-center font-semibold text-ui-text tabular-nums caret-ui-brand',
            'transition-[border-color,box-shadow] focus:border-ui-brand focus:outline-none focus:ring-[3px] focus:ring-ui-brand-soft',
            'disabled:cursor-not-allowed disabled:opacity-60',
            size === 'sm' ? 'h-11 max-w-11 text-lg' : 'h-14 max-w-14 text-2xl',
            invalid ? 'border-ui-danger' : value[i] ? 'border-ui-brand/60' : 'border-ui-line',
          )}
        />
      ))}
    </div>
  )
})
