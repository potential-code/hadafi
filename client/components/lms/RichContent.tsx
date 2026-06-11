'use client'

import DOMPurify from 'isomorphic-dompurify'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

const HTML_TAG_RE = /<[a-zA-Z][^>]*>/

function isHtml(content: string): boolean {
  return HTML_TAG_RE.test(content.trim())
}

type Props = {
  content: string | null | undefined
  className?: string
}

export function RichContent({ content, className }: Props) {
  if (!content) return null

  const base = cn(
    'prose prose-sm max-w-none',
    'prose-headings:text-brand-text-primary prose-headings:font-black',
    'prose-p:text-brand-text-muted prose-p:leading-relaxed',
    'prose-strong:text-brand-text-primary prose-strong:font-bold',
    'prose-em:text-brand-text-muted',
    'prose-a:text-brand-primary prose-a:no-underline hover:prose-a:underline',
    'prose-ul:text-brand-text-muted prose-ol:text-brand-text-muted',
    'prose-li:marker:text-brand-primary',
    'prose-blockquote:border-brand-primary prose-blockquote:text-brand-text-muted',
    'prose-code:text-brand-primary prose-code:bg-brand-surface-2 prose-code:rounded prose-code:px-1',
    className,
  )

  if (isHtml(content)) {
    return (
      <div
        className={base}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
      />
    )
  }

  return (
    <div className={base}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
