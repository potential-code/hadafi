'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Destructive actions start on Cancel so Enter never confirms by accident.
    cancelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const danger = variant === 'danger'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="w-full max-w-sm rounded-[14px] border border-ui-line bg-ui-surface p-5 shadow-ui"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div className="mb-5 flex items-start gap-3">
          <span
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
              danger ? 'bg-ui-danger-soft text-ui-danger' : 'bg-ui-brand-soft text-ui-brand-text',
            )}
          >
            {danger ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <Info className="h-4 w-4" aria-hidden />}
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-[15px] font-semibold leading-snug text-ui-text">
              {title}
            </h2>
            <p id="confirm-message" className="mt-1 text-sm leading-relaxed text-ui-muted">
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={btn({ variant: 'secondary', size: 'sm' })}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={btn({ variant: danger ? 'danger' : 'primary', size: 'sm' })}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
