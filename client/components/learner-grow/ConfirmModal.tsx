'use client'

/** Small confirm dialog in the redesign kit style (My Sessions cancel confirmation). */
import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/kit'

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Keep it',
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cm-title"
        aria-describedby="cm-body"
        className="w-full max-w-sm rounded-[14px] border border-ui-line bg-ui-surface p-5 shadow-ui"
      >
        <div className="flex items-start gap-3">
          {danger && (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ui-danger-soft text-ui-danger">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </span>
          )}
          <div className="flex flex-col gap-1">
            <h2 id="cm-title" className="text-base font-semibold text-ui-text">{title}</h2>
            <p id="cm-body" className="text-sm leading-relaxed text-ui-muted">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
