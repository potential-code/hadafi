'use client'

/**
 * "Watch recording" for an event: a YouTube recording plays inside Hadafi in a
 * dialog (Hadafi's player, no YouTube links); any other link (Zoom, Drive)
 * still opens in a new tab.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { VideoPlayer, isYouTube } from './VideoPlayer'

export function RecordingLink({
  url,
  title,
  className,
  children,
}: {
  url: string
  title: string
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const trigger = triggerRef.current
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
      trigger?.focus({ preventScroll: true })
    }
  }, [open])

  if (!isYouTube(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    )
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {/* Portalled to <body>: a lifted (transformed) card around the button would
          otherwise trap this fixed overlay inside the card, so it shrank on hover. */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div role="dialog" aria-modal="true" aria-label={`Recording: ${title}`} className="w-full max-w-5xl">
            <div className="mb-2 flex items-center gap-3 text-white">
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</p>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close recording"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <VideoPlayer url={url} title={title} autoPlay />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
