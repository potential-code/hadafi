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
    'prose-headings:text-ui-text prose-headings:font-semibold',
    'prose-p:text-ui-text prose-p:leading-relaxed',
    'prose-strong:text-ui-text prose-strong:font-bold',
    'prose-em:text-ui-muted',
    'prose-a:text-ui-brand-text prose-a:no-underline hover:prose-a:underline',
    'prose-ul:text-ui-muted prose-ol:text-ui-muted',
    'prose-li:marker:text-ui-brand-text',
    'prose-blockquote:border-ui-brand prose-blockquote:text-ui-muted',
    'prose-code:text-ui-brand-text prose-code:bg-ui-surface-2 prose-code:rounded prose-code:px-1',
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
