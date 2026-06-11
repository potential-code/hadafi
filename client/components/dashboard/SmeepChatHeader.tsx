'use client'

import type { ReactNode } from 'react'

export function SmeepChatHeader({
  name = 'Sana',
  status = 'Online',
  onClose,
  compact = false,
  actions,
}: {
  name?: string
  status?: string
  onClose?: () => void
  compact?: boolean
  /** Optional right-aligned header actions (e.g. the voice "Talk to …" pill). */
  actions?: ReactNode
}) {
  return (
    <div
      className="relative flex items-center gap-3 text-white flex-shrink-0"
      style={{
        background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)',
        padding: compact ? '12px 16px' : '14px 18px',
      }}
    >
      <div className="relative flex-shrink-0">
        <img
          src="/images/redesign/smeep-avatar-96.png"
          alt="Sana"
          className="w-10 h-10 rounded-full object-cover object-top ring-2 ring-white/30 shadow-md"
        />
        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white/20" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm sm:text-base font-bold leading-tight truncate">{name}</h3>
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
          <span className="relative flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
            <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
          </span>
          {status}
        </p>
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white/85 hover:text-white hover:bg-white/15 transition-colors flex-shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      )}
    </div>
  )
}
