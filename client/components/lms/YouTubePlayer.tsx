'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Maximize, Minimize, Pause, Play } from 'lucide-react'

type Props = {
  videoUrl: string
  onProgress?: (pct: number) => void
}

function getYouTubeId(url: string): string {
  try {
    if (url.includes('youtube.com/watch')) {
      return new URL(url).searchParams.get('v') || ''
    }
    if (url.includes('youtu.be/')) {
      return url.split('youtu.be/')[1]?.split('?')[0] || ''
    }
    if (url.includes('youtube.com/embed/') || url.includes('youtube-nocookie.com/embed/')) {
      return url.match(/(?:youtube\.com|youtube-nocookie\.com)\/embed\/([^?&/]+)/)?.[1] || ''
    }
  } catch {}
  return ''
}

export function YouTubePlayer({ videoUrl, onProgress }: Props) {
  const id = getYouTubeId(videoUrl)

  const playerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fullscreenWrapperRef = useRef<HTMLDivElement | null>(null)
  const isInitializedRef = useRef(false)
  const isPlayerReadyRef = useRef(false)
  const pollIntervalRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  // Keep latest callbacks in refs so initPlayer / checkVideoProgress
  // closures never go stale — and never need to be recreated on re-render.
  const onProgressRef = useRef(onProgress)
  useEffect(() => { onProgressRef.current = onProgress }, [onProgress])

  const [isPlaying, setIsPlaying] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [isInFullscreen, setIsInFullscreen] = useState(false)

  const clearHide = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearHide()
    hideTimerRef.current = window.setTimeout(() => setShowOverlay(false), 2500)
  }, [clearHide])

  const bumpOverlay = useCallback(() => {
    setShowOverlay(true)
    scheduleHide()
  }, [scheduleHide])

  // Stable — reads refs, no prop dependencies
  const checkVideoProgress = useCallback(() => {
    try {
      const player = playerRef.current
      if (!player || !isPlayerReadyRef.current) return
      const duration = player.getDuration?.()
      const current = player.getCurrentTime?.()
      if (!duration || duration <= 0) return
      const pct = Math.min(100, Math.round((current / duration) * 100))
      onProgressRef.current?.(pct)
    } catch {}
  }, [])

  // Stable — only depends on `id` which is derived from the URL.
  // Callbacks accessed via refs so this never needs to be recreated
  // when the parent re-renders.
  const initPlayer = useCallback(() => {
    if (!id || isInitializedRef.current) return
    const YT = (window as any).YT
    if (!YT || !containerRef.current) return

    isInitializedRef.current = true

    playerRef.current = new YT.Player(containerRef.current, {
      host: 'https://www.youtube-nocookie.com',
      videoId: id,
      playerVars: {
        controls: 0,
        disablekb: 1,
        rel: 0,
        fs: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        playsinline: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        enablejsapi: 1,
      },
      events: {
        onReady: () => {
          setTimeout(() => {
            isPlayerReadyRef.current = true
            bumpOverlay()
            if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = window.setInterval(checkVideoProgress, 1000)
          }, 600)
        },
        onStateChange: (event: any) => {
          const YTState = (window as any).YT?.PlayerState
          if (!YTState) return
          if (event.data === YTState.PLAYING) {
            setIsPlaying(true)
            bumpOverlay()
          } else if (event.data === YTState.PAUSED) {
            setIsPlaying(false)
            clearHide()
            setShowOverlay(true)
          } else if (event.data === YTState.ENDED) {
            onProgressRef.current?.(100)
            clearHide()
            setShowOverlay(true)
          }
        },
        onError: () => {
          setPlayerError("Video couldn't be loaded. It may be private, removed, or restricted.")
        },
      },
    })
  }, [id, bumpOverlay, clearHide, checkVideoProgress])

  // Only re-runs when the video ID changes — not on every parent render
  useEffect(() => {
    if (!id || isInitializedRef.current || !containerRef.current) return

    isPlayerReadyRef.current = false

    const initialize = () => {
      if (isInitializedRef.current) return
      if ((window as any).YT?.Player) {
        initPlayer()
        return
      }
      if (!document.querySelector('#youtube-iframe-api')) {
        const script = document.createElement('script')
        script.id = 'youtube-iframe-api'
        script.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(script)
      }
      const existing = (window as any).onYouTubeIframeAPIReady
      ;(window as any).onYouTubeIframeAPIReady = () => {
        existing?.()
        initPlayer()
      }
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              initialize()
              observer.disconnect()
            }
          })
        },
        { rootMargin: '50px' },
      )
      observer.observe(containerRef.current)
      return () => {
        observer.disconnect()
        isInitializedRef.current = false
        isPlayerReadyRef.current = false
        if (playerRef.current?.destroy) playerRef.current.destroy()
        if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current)
      }
    } else {
      initialize()
      return () => {
        isInitializedRef.current = false
        isPlayerReadyRef.current = false
        if (playerRef.current?.destroy) playerRef.current.destroy()
        if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current)
      }
    }
  }, [id, initPlayer])

  useEffect(() => {
    const check = () => {
      const d = document as any
      const el = d.fullscreenElement || d.webkitFullscreenElement
      const isOurs = el === fullscreenWrapperRef.current
      setIsInFullscreen(isOurs)
      if (isOurs) setShowOverlay(true)
    }
    document.addEventListener('fullscreenchange', check)
    document.addEventListener('webkitfullscreenchange', check)
    return () => {
      document.removeEventListener('fullscreenchange', check)
      document.removeEventListener('webkitfullscreenchange', check)
    }
  }, [])

  const togglePlay = () => {
    const player = playerRef.current
    if (!player || !isPlayerReadyRef.current) return
    const state = player.getPlayerState?.()
    const YTState = (window as any).YT?.PlayerState
    if (state === YTState?.PLAYING) {
      player.pauseVideo()
      setIsPlaying(false)
    } else {
      player.playVideo()
      setIsPlaying(true)
    }
  }

  const toggleFullscreen = () => {
    const d = document as any
    const el = d.fullscreenElement || d.webkitFullscreenElement
    const wrapper = fullscreenWrapperRef.current as any
    if (el) {
      d.exitFullscreen?.() ?? d.webkitExitFullscreen?.()
    } else {
      wrapper?.requestFullscreen?.() ?? wrapper?.webkitRequestFullscreen?.()
    }
  }

  if (!id) {
    return (
      <div className="flex items-center justify-center aspect-video rounded-2xl bg-brand-surface-2 text-sm text-brand-text-muted">
        Invalid video URL
      </div>
    )
  }

  return (
    <div
      ref={fullscreenWrapperRef}
      className="relative w-full rounded-2xl overflow-hidden bg-black shadow-lg ring-1 ring-black/5"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={bumpOverlay}
      onTouchStart={bumpOverlay}
    >
      <div ref={containerRef} className="w-full h-full bg-black" />

      {playerError && (
        <div className="absolute inset-x-0 top-0 z-[60] bg-amber-50 border-b border-amber-200 px-3 py-2 text-center">
          <p className="text-sm text-amber-800">{playerError}</p>
        </div>
      )}

      {/* Block top bar clicks (YT branding) */}
      <div aria-hidden className="absolute left-0 right-0 top-0 h-14" style={{ background: 'rgba(0,0,0,0.01)', zIndex: 40 }} />
      {/* Block bottom-right corner (YT logo / watch later) */}
      <div aria-hidden className="absolute right-0 bottom-0 w-36 h-12" style={{ background: 'rgba(0,0,0,0.01)', zIndex: 40 }} />
      {/* Absorb pointer events to prevent seeking */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ zIndex: 35, pointerEvents: 'auto' }}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      />

      {showOverlay && (
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); bumpOverlay() }}
          className="absolute z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 rounded-full p-4 flex items-center justify-center transition-colors"
        >
          {isPlaying ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white" />}
        </button>
      )}

      {(showOverlay || isInFullscreen) && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleFullscreen(); bumpOverlay() }}
          className="absolute right-3 bottom-3 z-50 bg-black/50 hover:bg-black/70 rounded p-2 transition-colors"
        >
          {isInFullscreen ? <Minimize className="w-5 h-5 text-white" /> : <Maximize className="w-5 h-5 text-white" />}
        </button>
      )}
    </div>
  )
}
