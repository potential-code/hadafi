'use client'

/**
 * Hana on a course page (ported from SMEEP fc50679, 5326d08 and later fixes):
 * a launcher at the bottom right opens her chat. On wide screens (1280px+)
 * she opens as a drawer beside the lesson, which narrows to make room; a
 * header button floats her instead, remembered on this device. Below that she
 * is a floating panel, and a bottom sheet on phones.
 *
 * She sees the course, the learner's progress and the step on screen
 * (potential-ai's `smeepCourseHelp` agent, whose rules, including never
 * giving answers, live on potential-ai). The chat loads on first open and
 * then stays mounted, so closing the panel keeps the conversation.
 */
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMinWidth } from './useMinWidth'
import type { CourseHanaChatProps } from './CourseHanaChat'
import './course-hana.css'

/** Same image as HanaMessages' portrait, without loading the chat bundle. */
const HANA_AVATAR_SRC = '/images/redesign/hana-avatar.webp'

const CourseHanaChat = dynamic(() => import('./CourseHanaChat'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-ui-muted" aria-busy="true">
      <span className="h-2 w-24 animate-pulse rounded-full bg-ui-surface-2" />
      Opening Hana
    </div>
  ),
})

const MODE_KEY = 'hadafi.courseHana.mode'
/** Screens wide enough for Hana to sit beside the lesson as a drawer. */
export const DOCK_MIN = 1280

export type HanaLayout = {
  /** The screen is wide enough and the page has room for a drawer. */
  canDock: boolean
  docked: boolean
  toggle: () => void
}

export function CourseHana({
  dockable = false,
  onDockedChange,
  ...props
}: Omit<CourseHanaChatProps, 'open' | 'onClose' | 'layout'> & {
  /** Rendered where a side drawer can take its place in the page's row. */
  dockable?: boolean
  /** Whether Hana is open as a drawer (the page makes room for her). */
  onDockedChange?: (docked: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const wide = useMinWidth(DOCK_MIN)
  const [mode, setMode] = useState<'drawer' | 'float'>('drawer')
  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === 'float') setMode('float')
    } catch {
      /* storage blocked: keep the default */
    }
  }, [])
  const canDock = dockable && wide
  const docked = canDock && mode === 'drawer'
  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === 'drawer' ? 'float' : 'drawer'
      try {
        localStorage.setItem(MODE_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])
  useEffect(() => onDockedChange?.(open && docked), [open, docked, onDockedChange])

  const show = useCallback(() => {
    setLoaded(true)
    setOpen(true)
  }, [])
  const close = useCallback(() => {
    setOpen(false)
    launcherRef.current?.focus({ preventScroll: true })
  }, [])

  // Esc closes from anywhere inside the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelRef.current?.contains(document.activeElement)) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // A phone sheet shouldn't let the page scroll behind it.
  useEffect(() => {
    if (!open || !window.matchMedia('(max-width: 640px)').matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      {open && !docked && (
        <div aria-hidden onClick={close} className="course-hana-scrim fixed inset-0 z-[45] bg-[rgba(16,10,28,0.42)] min-[641px]:hidden" />
      )}

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Hana, your course guide"
        aria-modal={false}
        hidden={!open}
        className={cn(
          'course-hana-panel flex flex-col overflow-hidden bg-ui-surface text-ui-text',
          docked
            ? // Wide screens: a drawer in the page's row; the lesson narrows.
              'course-hana-docked relative w-[380px] shrink-0 border-s border-ui-line'
            : [
                'fixed z-[46]',
                // Phone: a bottom sheet under a scrim.
                'inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+max(44px,9vh))] rounded-t-[20px]',
                // Larger: a card above the launcher.
                'min-[641px]:inset-auto min-[641px]:end-5 min-[641px]:w-[380px] min-[641px]:rounded-[18px] min-[641px]:border min-[641px]:border-ui-line',
                'min-[641px]:bottom-[calc(52px+env(safe-area-inset-bottom)+16px+68px)] min-[641px]:h-[min(600px,calc(100dvh-52px-env(safe-area-inset-bottom)-16px-68px-24px))]',
                'lg:bottom-[88px] lg:h-[min(580px,calc(100dvh-112px))]',
              ],
        )}
      >
        {loaded && <CourseHanaChat {...props} open={open} onClose={close} layout={{ canDock, docked, toggle: toggleMode }} />}
      </div>

      <button
        ref={launcherRef}
        type="button"
        onClick={open ? close : show}
        aria-expanded={open}
        aria-label={open ? 'Close Hana' : 'Ask Hana about this course'}
        title={open ? undefined : 'Ask Hana about this course'}
        className={cn(
          'course-hana-launcher fixed end-4 z-[46] flex h-14 w-14 items-center justify-center rounded-full',
          'bottom-[calc(52px+env(safe-area-inset-bottom)+16px)] lg:bottom-5 lg:end-5',
          'transition-[transform,background-color] duration-200 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-0.5 active:scale-[0.97]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
          open ? 'bg-ui-brand text-white hover:bg-ui-brand-hover max-[640px]:hidden' : 'bg-ui-surface p-[3px] ring-2 ring-ui-brand',
          // The drawer has its own close button and would sit under the launcher.
          open && docked && 'hidden',
        )}
      >
        {open ? (
          <ChevronDown className="h-6 w-6" strokeWidth={2} aria-hidden />
        ) : (
          <img src={HANA_AVATAR_SRC} alt="" className="h-full w-full rounded-full object-cover object-top" />
        )}
      </button>
    </>
  )
}
