'use client'

import { ImageIcon } from 'lucide-react'
import { type LearnerBlock } from '@/lib/api/lms'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
}

export function ImageBlock({ block }: Props) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-primary/10 text-brand-primary shrink-0">
          <ImageIcon className="w-4 h-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">Image</p>
          <h3 className="text-base sm:text-lg font-black text-brand-text-primary leading-tight">
            {block.title}
          </h3>
        </div>
      </div>

      {block.imageUrl && (
        <div className="flex justify-center">
          <img
            src={block.imageUrl}
            alt={block.title}
            className="max-h-96 w-auto rounded-xl border border-brand-surface-2 shadow-sm object-contain"
          />
        </div>
      )}
    </div>
  )
}
