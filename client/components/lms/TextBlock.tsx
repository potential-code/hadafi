'use client'

import { type LearnerBlock } from '@/lib/api/lms'
import { RichContent } from './RichContent'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
}

/**
 * Reading copy for the course player: larger type, theme-aware colours.
 * Imported course copy wraps paragraphs in <h5>, so h5 reads as body text.
 */
export const LESSON_PROSE =
  '!text-[16px] sm:!text-[17px] [&_p]:!leading-[1.7] [&_li]:!leading-[1.7] [&_p]:!text-ui-text [&_li]:!text-ui-text [&_li::marker]:!text-ui-brand-text [&_h1]:!text-ui-text [&_h2]:!text-ui-text [&_h3]:!text-ui-text [&_h4]:!text-ui-text [&_h1]:!font-semibold [&_h2]:!font-semibold [&_h3]:!font-semibold [&_h4]:!font-semibold [&_strong]:!text-ui-text [&_em]:!text-ui-muted [&_a]:!text-ui-brand-text [&_blockquote]:!border-ui-brand [&_blockquote]:!text-ui-muted [&_td]:!text-ui-text [&_th]:!text-ui-text [&_h5]:!text-ui-text [&_h6]:!text-ui-text [&_h5]:!text-[1em] [&_h5]:!font-normal [&_h5]:!leading-[1.7] [&_h5]:!my-[0.6em] [&_li_h5]:!my-0'

/** The step heading above already shows the block's title. */
export function TextBlock({ block }: Props) {
  return <RichContent content={block.body} className={LESSON_PROSE} />
}
