'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Video } from 'lucide-react'
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
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-primary/10 text-brand-primary shrink-0">
          <Video className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">Watch</p>
          <h3 className="text-base sm:text-lg font-black text-brand-text-primary leading-tight">
            {block.title}
          </h3>
        </div>
        {isAlreadyCompleted && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        )}
      </div>

      {isYouTube ? (
        <YouTubePlayer
          videoUrl={block.videoUrl!}
          onProgress={handleYtProgress}
        />
      ) : (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video shadow-lg ring-1 ring-black/5">
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
          <div className="flex items-center justify-between text-[10px] font-bold text-brand-text-muted mb-1.5">
            <span>Watch 95% to complete</span>
            <span>{Math.round(ytWatchPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-brand-surface-2 overflow-hidden">
            <motion.div
              animate={{ width: `${ytWatchPct}%` }}
              transition={{ duration: 0.3 }}
              className={cn(
                'h-full rounded-full transition-colors',
                ytWatchPct >= 95
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-brand-primary to-brand-primary-dark',
              )}
            />
          </div>
        </div>
      )}

      {!isAlreadyCompleted && !isYouTube && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] font-bold text-brand-text-muted mb-1.5">
            <span>Watch 95% to complete</span>
            <span>{Math.round(watchPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-brand-surface-2 overflow-hidden">
            <motion.div
              animate={{ width: `${watchPct}%` }}
              transition={{ duration: 0.3 }}
              className={cn(
                'h-full rounded-full transition-colors',
                watchPct >= 95
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-brand-primary to-brand-primary-dark',
              )}
            />
          </div>
        </div>
      )}

      {block.transcript && (
        <div className="mt-4">
          <button
            onClick={() => setTranscriptOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-text-muted hover:text-brand-primary transition-colors"
          >
            {transcriptOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
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
                <div className="mt-3 rounded-xl border border-brand-surface-2 bg-brand-surface p-4">
                  <RichContent
                    content={block.transcript}
                    className="text-sm text-brand-text-muted"
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
