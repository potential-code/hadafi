'use client'

import { FileText } from 'lucide-react'
import { type LearnerBlock } from '@/lib/api/lms'
import { RichContent } from './RichContent'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
}

export function TextBlock({ block }: Props) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-primary/10 text-brand-primary shrink-0">
          <FileText className="w-4 h-4" />
        </span>
        <div>
          <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">Read</p>
          <h3 className="text-base sm:text-lg font-black text-brand-text-primary leading-tight">
            {block.title}
          </h3>
        </div>
      </div>

      <RichContent content={block.body} />
    </div>
  )
}
