'use client'

import { btn } from '@/components/kit'
import { Modal } from '@/components/admin/ui'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  tone = 'danger',
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  /** `danger` (default) for destructive actions, `primary` otherwise. */
  tone?: 'danger' | 'primary'
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onCancel} className={btn({ variant: 'secondary', size: 'sm' })}>
            Cancel
          </button>
          <button
            type="button"
            data-autofocus
            onClick={onConfirm}
            className={btn({ variant: tone === 'danger' ? 'danger' : 'primary', size: 'sm' })}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ui-muted">{message}</p>
    </Modal>
  )
}
