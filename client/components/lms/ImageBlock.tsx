'use client'

import { type LearnerBlock } from '@/lib/api/lms'
import { optimizedSrc } from '@/lib/images'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
}

/** The step heading above already shows the block's title. */
export function ImageBlock({ block }: Props) {
  if (!block.imageUrl) return null
  return (
    <div className="flex justify-center">
      <img
        src={optimizedSrc(block.imageUrl)}
        alt={block.title}
        className="max-h-96 w-auto max-w-full rounded-[10px] border border-ui-line object-contain shadow-sm"
      />
    </div>
  )
}
