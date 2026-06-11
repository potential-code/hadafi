'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Info } from 'lucide-react'

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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
            variant === 'danger' ? 'bg-rose-100' : 'bg-brand-surface'
          }`}>
            {variant === 'danger'
              ? <AlertTriangle className="w-4 h-4 text-rose-600" />
              : <Info className="w-4 h-4 text-brand-primary" />
            }
          </div>
          <div>
            <h2 id="confirm-title" className="text-sm font-bold text-brand-text-primary leading-snug">
              {title}
            </h2>
            <p id="confirm-message" className="text-xs text-brand-text-muted mt-1 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-brand-surface text-brand-text-secondary text-xs font-bold hover:bg-brand-surface-2 transition-colors border border-brand-surface-2"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm ${
              variant === 'danger'
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-brand-primary text-white hover:bg-brand-primary-dark'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
