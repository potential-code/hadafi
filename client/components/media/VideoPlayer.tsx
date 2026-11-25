'use client'

/**
 * Hadafi's video player (port of SMEEP's): every YouTube video on the platform plays here, inside
 * Hadafi. YouTube's own chrome is never clickable (no title link, logo,
 * "Watch on YouTube", suggestions or end screen). Controls are kept basic:
 * play/pause, back 10 seconds, volume, subtitles and full screen. Each learner
 * resumes where they stopped.
 *
 * - `gated`: learners can rewatch but not skip past what they've watched
 *   (courses and journeys, where watching counts).
 * - `onProgress(pct)`: percent of the video (or segment) actually watched.
 * - `startSeconds` / `endSeconds`: play only an assigned segment.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Captions,
  CaptionsOff,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { getUser } from '@/lib/auth'
import './video-player.css'
import { cn } from '@/lib/utils'

// ── YouTube ids and the IFrame API ──────────────────────────────────────────

export function youTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v')
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{6,})/)
      if (m) return m[1]
    }
  } catch {
    /* not a URL */
  }
  return /^[\w-]{11}$/.test(url.trim()) ? url.trim() : null
}

export function isYouTube(url: string | null | undefined): boolean {
  return !!youTubeId(url)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type YTPlayer = any
let apiPromise: Promise<void> | null = null
function loadYouTubeApi(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  if (w.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    const previous = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    if (!document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script')
      tag.id = 'youtube-iframe-api'
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }
    // Another loader may have finished first.
    const poll = window.setInterval(() => {
      if (w.YT?.Player) {
        window.clearInterval(poll)
        resolve()
      }
    }, 200)
  })
  return apiPromise
}

// ── Resume positions (per learner, per video, on this device) ───────────────

type Saved = { t: number; max: number; d: number }
const keyFor = (id: string, seg: string) => `hadafi.video.${getUser()?.id ?? 'anon'}.${id}${seg}`
function readSaved(key: string): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Saved | null
    return v && typeof v.t === 'number' ? v : null
  } catch {
    return null
  }
}
function writeSaved(key: string, v: Saved) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage full or blocked: no resume */
  }
}

function clock(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

type Phase = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export function VideoPlayer({
  url,
  title = 'Video',
  gated = false,
  autoPlay = false,
  startSeconds,
  endSeconds,
  onProgress,
  onEnded,
  resumeAt,
  watchedPct,
  onSavePosition,
  className,
}: {
  url: string
  title?: string
  gated?: boolean
  autoPlay?: boolean
  startSeconds?: number | null
  endSeconds?: number | null
  onProgress?: (pct: number) => void
  onEnded?: () => void
  /** Saved on the server (course lessons): where to resume, in seconds. */
  resumeAt?: number | null
  /** Saved on the server: % of the video already watched. */
  watchedPct?: number | null
  /** Called every few seconds while playing, and on pause and leave. */
  onSavePosition?: (positionSec: number, watchPct: number) => void
  className?: string
}) {
  const id = youTubeId(url)
  const seg = typeof startSeconds === 'number' || typeof endSeconds === 'number' ? `.${startSeconds ?? 0}-${endSeconds ?? ''}` : ''
  const storageKey = id ? keyFor(id, seg) : ''

  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer>(null)
  const readyRef = useRef(false)
  const pendingPlay = useRef(false)
  const maxRef = useRef(0)
  const lastTimeRef = useRef(0)
  const endedFired = useRef(false)
  const resumeRef = useRef<number | null>(null)
  const captionsRef = useRef(false)
  const startedRef = useRef(false)
  const cb = useRef({ onProgress, onEnded, onSavePosition })
  useEffect(() => {
    cb.current = { onProgress, onEnded, onSavePosition }
  })

  const [phase, setPhase] = useState<Phase>(autoPlay ? 'loading' : 'idle')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [maxWatched, setMaxWatched] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(100)
  const [captions, setCaptions] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [resumeFrom, setResumeFrom] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const [started, setStarted] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)

  const segStart = typeof startSeconds === 'number' ? Math.max(0, startSeconds) : 0
  const segEnd = (d: number) => (typeof endSeconds === 'number' && endSeconds > segStart ? Math.min(endSeconds, d || endSeconds) : d)

  const showChrome = useCallback(() => {
    setChrome(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setChrome(false), 2800)
  }, [])

  // Create the player once the API is loaded and the box is near the screen.
  useEffect(() => {
    if (!id || !hostRef.current) return
    let cancelled = false
    const local = readSaved(storageKey)
    // The server's position (any device) wins over this browser's copy.
    const saved: Saved | null =
      resumeAt != null && resumeAt > 0 ? { t: resumeAt, max: Math.max(local?.max ?? 0, resumeAt), d: local?.d ?? 0 } : local
    if (saved) {
      maxRef.current = saved.max
      setMaxWatched(saved.max)
      setSavedAt(saved.t)
      if (saved.d) {
        setDuration(saved.d)
        // Report what was already watched, so progress shows before playing.
        const end = segEnd(saved.d)
        if (end > segStart) cb.current.onProgress?.(Math.min(100, Math.round(((saved.max - segStart) / (end - segStart)) * 100)))
      }
    }
    // Resume point, decided up front: the player is created cued there, so the
    // first play is an ordinary start (any jump on a fresh player brings up
    // YouTube's own title bar and "More videos").
    const near = saved?.d ? segEnd(saved.d) - 8 : Infinity
    const startAt = saved && saved.t > segStart + 5 && saved.t < near ? Math.floor(saved.t) : null
    resumeRef.current = startAt
    const host = hostRef.current
    const mount = document.createElement('div')
    host.appendChild(mount)
    // YouTube sizes its video once, when the player is created. If the box changes
    // size afterwards (a dialog opening, the page scrollbar going away, a window
    // resize), the picture stays at the old size in a corner of the frame. Tell the
    // player its real size whenever the box changes.
    const fitToBox = () => {
      const p = playerRef.current
      if (!p || !readyRef.current || !host.clientWidth) return
      try {
        p.setSize?.(host.clientWidth, host.clientHeight)
      } catch {
        /* player gone */
      }
    }
    const sizeObserver = 'ResizeObserver' in window ? new ResizeObserver(fitToBox) : null
    sizeObserver?.observe(host)

    const create = () =>
      loadYouTubeApi().then(() => {
        if (cancelled) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const YT = (window as any).YT
        playerRef.current = new YT.Player(mount, {
          host: 'https://www.youtube-nocookie.com',
          videoId: id,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            cc_load_policy: 0,
            origin: window.location.origin,
            enablejsapi: 1,
            ...(startAt != null ? { start: startAt } : segStart ? { start: Math.floor(segStart) } : {}),
          },
          events: {
            onReady: () => {
              readyRef.current = true
              fitToBox()
              const p = playerRef.current
              // Captions stay off unless the learner turns them on.
              try {
                p.unloadModule?.('captions')
              } catch {
                /* no captions module */
              }
              const d = p.getDuration?.() || 0
              if (d) setDuration(d)
              // Resume where they stopped (not in the first or last moments).
              // Applied on play: seeking an unstarted YouTube player brings up
              // YouTube's own title, logo and play button.
              const end = segEnd(d)
              if (resumeRef.current != null && end && resumeRef.current >= end - 8) {
                // Too close to the end to resume: start over instead.
                resumeRef.current = null
                p.cueVideoById?.({ videoId: id, startSeconds: segStart })
              }
              // What the server says was watched counts too (no skipping past it lost).
              if (watchedPct && end > segStart) {
                maxRef.current = Math.max(maxRef.current, segStart + ((end - segStart) * watchedPct) / 100)
                setMaxWatched(maxRef.current)
              }
              if (autoPlay || pendingPlay.current) {
                pendingPlay.current = false
                startPlayback()
              }
            },
            onStateChange: (e: { data: number }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const S = (window as any).YT.PlayerState
              if (e.data === S.PLAYING) {
                if (!startedRef.current && !captionsRef.current) {
                  try {
                    playerRef.current?.unloadModule?.('captions')
                  } catch {
                    /* no captions module */
                  }
                }
                startedRef.current = true
                setStarted(true)
                setPhase('playing')
                showChrome()
              } else if (e.data === S.PAUSED) setPhase((ph) => (ph === 'ended' ? ph : 'paused'))
              else if (e.data === S.BUFFERING) setPhase((ph) => (ph === 'idle' ? 'loading' : ph))
              else if (e.data === S.ENDED) finish()
            },
            onError: () => setPhase('error'),
          },
        })
      })

    let observer: IntersectionObserver | null = null
    if ('IntersectionObserver' in window && !autoPlay) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((en) => en.isIntersecting)) {
            observer?.disconnect()
            void create()
          }
        },
        { rootMargin: '200px' },
      )
      observer.observe(hostRef.current)
    } else void create()

    return () => {
      cancelled = true
      observer?.disconnect()
      sizeObserver?.disconnect()
      const p = playerRef.current
      if (p && readyRef.current) {
        try {
          const t = p.getCurrentTime?.() || 0
          writeSaved(storageKey, { t, max: maxRef.current, d: p.getDuration?.() || 0 })
          if (startedRef.current) report(t)
        } catch {
          /* player gone */
        }
      }
      try {
        p?.destroy?.()
      } catch {
        /* already destroyed */
      }
      playerRef.current = null
      readyRef.current = false
      mount.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one player per video
  }, [id, storageKey])

  /** Reports the position (and watched %) to whoever stores it. */
  function report(t: number) {
    const p = playerRef.current
    const d = p?.getDuration?.() || duration
    const end = segEnd(d)
    const span = end - segStart
    if (span <= 0) return
    const pct = Math.min(100, Math.round(((maxRef.current - segStart) / span) * 100))
    cb.current.onSavePosition?.(Math.max(0, Math.floor(t)), Math.max(0, pct))
  }

  function finish() {
    const p = playerRef.current
    setPhase('ended')
    setChrome(true)
    const d = p?.getDuration?.() || duration
    maxRef.current = segEnd(d)
    setMaxWatched(maxRef.current)
    writeSaved(storageKey, { t: segStart, max: maxRef.current, d })
    report(segStart)
    cb.current.onProgress?.(100)
    if (!endedFired.current) {
      endedFired.current = true
      cb.current.onEnded?.()
    }
  }

  // Track time, what's been watched, and save the position.
  useEffect(() => {
    if (phase !== 'playing') return
    let ticks = 0
    const iv = window.setInterval(() => {
      const p = playerRef.current
      if (!p || !readyRef.current) return
      const t = p.getCurrentTime?.() || 0
      const d = p.getDuration?.() || 0
      if (d && d !== duration) setDuration(d)
      // Natural playback (not a jump) extends what counts as watched.
      if (t - lastTimeRef.current < 2.5 && t > maxRef.current) maxRef.current = t
      lastTimeRef.current = t
      setTime(t)
      setMaxWatched(maxRef.current)
      const end = segEnd(d)
      const span = end - segStart
      if (span > 0) cb.current.onProgress?.(Math.min(100, Math.round(((maxRef.current - segStart) / span) * 100)))
      if (typeof endSeconds === 'number' && t >= end) {
        p.pauseVideo()
        finish()
      }
      if (++ticks % 5 === 0) writeSaved(storageKey, { t, max: maxRef.current, d })
      if (ticks % 20 === 0) report(t)
    }, 500)
    return () => window.clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, storageKey])

  /** First play jumps to the resume point (with a note), then plays. */
  function startPlayback() {
    const p = playerRef.current
    if (!p) return
    const t = resumeRef.current
    if (t != null && !startedRef.current) {
      // Already cued at the saved second (see the player's start setting).
      resumeRef.current = null
      lastTimeRef.current = t
      setTime(t)
      setResumeFrom(t)
      window.setTimeout(() => setResumeFrom(null), 6000)
    }
    p.playVideo()
  }

  const play = useCallback(() => {
    const p = playerRef.current
    if (!p || !readyRef.current) {
      pendingPlay.current = true
      setPhase('loading')
      return
    }
    if (phase === 'ended') {
      endedFired.current = false
      p.seekTo(segStart, true)
      lastTimeRef.current = segStart
    }
    if (!startedRef.current) setPhase('loading')
    startPlayback()
  }, [phase, segStart])

  const pause = useCallback(() => {
    const p = playerRef.current
    p?.pauseVideo?.()
    if (p && readyRef.current) {
      const t = p.getCurrentTime?.() || 0
      writeSaved(storageKey, { t, max: maxRef.current, d: p.getDuration?.() || 0 })
      report(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const toggle = useCallback(() => (phase === 'playing' ? pause() : play()), [phase, pause, play])

  const seekTo = useCallback(
    (target: number) => {
      const p = playerRef.current
      if (!p || !readyRef.current) return
      const end = segEnd(duration)
      let t = Math.max(segStart, Math.min(target, end - 0.5))
      if (gated) t = Math.min(t, Math.max(maxRef.current, segStart))
      lastTimeRef.current = t
      p.seekTo(t, true)
      setTime(t)
      showChrome()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duration, gated, segStart, showChrome],
  )

  const toggleMute = () => {
    const p = playerRef.current
    if (!p) return
    if (muted) {
      p.unMute()
      if (volume === 0) {
        p.setVolume(60)
        setVolume(60)
      }
    } else p.mute()
    setMuted(!muted)
  }
  const changeVolume = (v: number) => {
    const p = playerRef.current
    setVolume(v)
    p?.setVolume?.(v)
    if (v === 0) {
      p?.mute?.()
      setMuted(true)
    } else if (muted) {
      p?.unMute?.()
      setMuted(false)
    }
  }
  const toggleCaptions = () => {
    const p = playerRef.current
    if (!p) return
    try {
      if (captions) p.unloadModule('captions')
      else {
        p.loadModule('captions')
        p.setOption?.('captions', 'track', { languageCode: 'en' })
      }
    } catch {
      /* captions unavailable for this video */
    }
    captionsRef.current = !captions
    setCaptions(!captions)
  }
  const toggleFullscreen = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = document as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = wrapRef.current as any
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d)
    else (el?.requestFullscreen ?? el?.webkitRequestFullscreen)?.call(el)
  }
  // Leaving the page (tab closed, app backgrounded) saves where they were.
  useEffect(() => {
    const onHide = () => {
      const p = playerRef.current
      if (p && readyRef.current && startedRef.current) report(p.getCurrentTime?.() || 0)
    }
    window.addEventListener('pagehide', onHide)
    const onVis = () => document.visibilityState === 'hidden' && onHide()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onChange = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = document as any
      setFullscreen((d.fullscreenElement || d.webkitFullscreenElement) === wrapRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    const k = e.key.toLowerCase()
    if (k === ' ' || k === 'k') toggle()
    else if (k === 'arrowleft' || k === 'j') seekTo(time - 10)
    else if (k === 'm') toggleMute()
    else if (k === 'f') toggleFullscreen()
    else if (k === 'c') toggleCaptions()
    else return
    e.preventDefault()
    showChrome()
  }

  if (!id) {
    return (
      <div className={cn('flex aspect-video w-full items-center justify-center rounded-[14px] bg-ui-surface-2 text-sm text-ui-muted', className)}>
        This video link isn&rsquo;t valid.
      </div>
    )
  }

  const end = segEnd(duration)
  const shownTime = Math.max(0, time - segStart)
  const shownTotal = Math.max(0, end - segStart)
  const pct = shownTotal ? (shownTime / shownTotal) * 100 : 0
  const watchedBar = shownTotal ? (Math.max(0, maxWatched - segStart) / shownTotal) * 100 : 0
  // Our cover stays up until playback really starts, and at the end, so
  // YouTube's own start and end screens never show.
  const covered = !started || phase === 'ended' || phase === 'error'
  const controlsOn = chrome || phase !== 'playing'
  const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

  return (
    <div
      ref={wrapRef}
      role="region"
      aria-label={title}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseMove={showChrome}
      onFocus={showChrome}
      className={cn(
        'hadafi-video group/video relative w-full select-none overflow-hidden rounded-[14px] bg-black outline-none ring-1 ring-black/5 focus-visible:ring-2 focus-visible:ring-ui-brand',
        fullscreen ? 'rounded-none' : 'aspect-video',
        !controlsOn && 'cursor-none',
        className,
      )}
    >
      {/* YouTube's iframe, taller than the box: the video sits centred and
          fully visible, while YouTube's title bar, "More videos" strip and
          logo fall in the extra space above and below, which is cropped.
          It never receives the pointer, so nothing of YouTube's is clickable. */}
      <div
        ref={hostRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-[140px] h-[calc(100%+280px)] [&>div]:h-full [&>div]:w-full [&_iframe]:h-full [&_iframe]:w-full"
      />

      {/* Click surface: play/pause, double-click for full screen. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="absolute inset-0 z-10 cursor-[inherit]"
        onClick={() => {
          toggle()
          showChrome()
        }}
        onDoubleClick={toggleFullscreen}
      />

      {/* Before play, at the end, or on error: our own cover hides YouTube's suggestions. */}
      {covered && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
          <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30" />
          {phase === 'loading' ? (
            <Loader2 className="relative h-10 w-10 animate-spin text-white" aria-label="Loading video" />
          ) : phase === 'error' ? (
            <p className="relative max-w-[80%] rounded-[10px] bg-black/70 px-4 py-3 text-center text-sm text-white">
              This video can&rsquo;t be played right now. It may have been made private or removed.
            </p>
          ) : (
            <button
              type="button"
              onClick={play}
              aria-label={phase === 'ended' ? `Watch ${title} again` : `Play ${title}`}
              className="relative flex items-center gap-2.5 rounded-full bg-white/95 py-3 pe-5 ps-4 text-[15px] font-semibold text-[#1a1625] shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {phase === 'ended' ? <RotateCcw className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5 fill-current" aria-hidden />}
              {phase === 'ended' ? 'Watch again' : savedAt > segStart + 5 ? 'Continue watching' : 'Play'}
            </button>
          )}
        </div>
      )}

      {/* Paused: dim the bottom, where YouTube shows its "More videos" strip. */}
      {phase === 'paused' && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] h-[45%] bg-gradient-to-t from-black via-black/85 to-transparent" />
      )}
      {phase === 'loading' && started && (
        <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center">
          <Loader2 className="h-9 w-9 animate-spin text-white/90" aria-label="Loading video" />
        </div>
      )}
      {phase === 'paused' && (
        <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="h-7 w-7 fill-current" aria-hidden />
          </span>
        </div>
      )}

      {resumeFrom != null && phase !== 'idle' && (
        <div className="absolute start-3 top-3 z-30 flex items-center gap-2 rounded-full bg-black/75 py-1.5 pe-1.5 ps-3 text-xs font-medium text-white">
          Resuming from {clock(resumeFrom - segStart)}
          <button
            type="button"
            onClick={() => {
              setResumeFrom(null)
              seekTo(segStart)
            }}
            className="rounded-full bg-white/15 px-2.5 py-1 hover:bg-white/25"
          >
            Start over
          </button>
        </div>
      )}

      {/* Controls */}
      {!covered && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2 pt-8 text-white transition-opacity duration-200',
            controlsOn ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {/* Progress (display only): how far in, and how much has been watched. */}
          <div
            role="progressbar"
            aria-label={`${title} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-valuetext={`${clock(shownTime)} of ${clock(shownTotal)}`}
            className="relative mb-2 h-1 rounded-full bg-white/25"
          >
            <div className="absolute inset-y-0 start-0 rounded-full bg-white/35" style={{ width: `${Math.min(100, watchedBar)}%` }} />
            <div className="absolute inset-y-0 start-0 rounded-full bg-ui-brand" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="flex items-center gap-1">
            <CtrlButton label={phase === 'playing' ? 'Pause' : 'Play'} onClick={toggle}>
              {phase === 'playing' ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
            </CtrlButton>
            <CtrlButton label="Back 10 seconds" onClick={() => seekTo(time - 10)}>
              <RotateCcw className="h-[18px] w-[18px]" />
            </CtrlButton>
            <div className="group/vol flex items-center">
              <CtrlButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
                {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </CtrlButton>
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="hadafi-video-volume hidden h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/40 opacity-0 transition-[width,opacity] group-hover/vol:w-20 group-hover/vol:opacity-100 group-focus-within/vol:w-20 group-focus-within/vol:opacity-100 sm:block"
              />
            </div>
            <span className="ms-1.5 text-xs font-medium tabular-nums text-white/90" aria-hidden>
              {clock(shownTime)} / {clock(shownTotal)}
            </span>
            <span className="flex-1" />
            <CtrlButton label={captions ? 'Turn captions off' : 'Turn captions on'} onClick={toggleCaptions} pressed={captions}>
              {captions ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
            </CtrlButton>
            <CtrlButton label={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </CtrlButton>
          </div>
        </div>
      )}
    </div>
  )
}

function CtrlButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white [&_svg]:shrink-0"
    >
      {children}
    </button>
  )
}
