'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiUpdateBlockProgress, type LearnerBlock } from '@/lib/api/lms'
import { YouTubePlayer } from './YouTubePlayer'
import { RichContent } from './RichContent'
import { cn } from '@/lib/utils'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
  onWatchThreshold?: () => void
}

function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('youtube-nocookie.com')
}

export function VideoBlock({ block, onCompleted, onAdvance, onWatchThreshold }: Props) {
  const queryClient = useQueryClient()
  const hasFired = useRef(false)
  const thresholdFiredRef = useRef(false)
  const [watchPct, setWatchPct] = useState(0)
  const [ytWatchPct, setYtWatchPct] = useState(0)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  const isAlreadyCompleted = block.blockProgress?.status === 'completed'
  const isYouTube = !!block.videoUrl && isYouTubeUrl(block.videoUrl)

  const completeMutation = useMutation({
    mutationFn: () =>
      apiUpdateBlockProgress(block.id, { status: 'completed', videoWatchPct: 95 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-course'] })
      onCompleted()
    },
  })

  const handleYtProgress = (pct: number) => {
    setYtWatchPct((prev) => Math.max(prev, pct))
    if (pct >= 95 && !thresholdFiredRef.current) {
      thresholdFiredRef.current = true
      onWatchThreshold?.()
    }
  }

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    if (!video.duration || hasFired.current || isAlreadyCompleted) return
    const pct = (video.currentTime / video.duration) * 100
    setWatchPct(Math.min(pct, 100))
    if (pct >= 95) {
      hasFired.current = true
      completeMutation.mutate()
    }
  }

  return (
    <div>
      {isAlreadyCompleted && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ui-ok-soft px-3 py-1 text-xs font-semibold text-ui-ok">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Watched
        </p>
      )}

      {isYouTube ? (
        <YouTubePlayer
          videoUrl={block.videoUrl!}
          onProgress={handleYtProgress}
        />
      ) : (
        <div className="relative rounded-[14px] overflow-hidden bg-black aspect-video shadow-lg ring-1 ring-black/5">
          <video
            key={block.id}
            src={block.videoUrl ?? undefined}
            controls
            playsInline
            onTimeUpdate={handleTimeUpdate}
            className="w-full h-full object-contain bg-black"
          />
        </div>
      )}

      {!isAlreadyCompleted && isYouTube && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-medium text-ui-muted mb-1.5">
            <span>Watch 95% to complete</span>
            <span>{Math.round(ytWatchPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-ui-surface-2 overflow-hidden">
            <motion.div
              animate={{ width: `${ytWatchPct}%` }}
              transition={{ duration: 0.3 }}
              className={cn(
                'h-full rounded-full transition-colors',
                ytWatchPct >= 95
                  ? 'bg-ui-ok'
                  : 'bg-ui-brand',
              )}
            />
          </div>
        </div>
      )}

      {!isAlreadyCompleted && !isYouTube && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-medium text-ui-muted mb-1.5">
            <span>Watch 95% to complete</span>
            <span>{Math.round(watchPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-ui-surface-2 overflow-hidden">
            <motion.div
              animate={{ width: `${watchPct}%` }}
              transition={{ duration: 0.3 }}
              className={cn(
                'h-full rounded-full transition-colors',
                watchPct >= 95
                  ? 'bg-ui-ok'
                  : 'bg-ui-brand',
              )}
            />
          </div>
        </div>
      )}

      {block.transcript && (
        <div className="mt-4">
          <button
            onClick={() => setTranscriptOpen((v) => !v)}
            type="button"
            aria-expanded={transcriptOpen}
            className="inline-flex items-center gap-1.5 rounded-md text-xs font-bold text-ui-muted transition-colors hover:text-ui-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
          >
            {transcriptOpen ? <ChevronUp className="w-3.5 h-3.5" aria-hidden /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden />}
            Transcript
          </button>
          <AnimatePresence initial={false}>
            {transcriptOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-[10px] border border-ui-line bg-ui-bg p-4">
                  <RichContent
                    content={block.transcript}
                    className="text-sm [&_p]:!text-ui-text [&_li]:!text-ui-text"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
